import { useEffect, useLayoutEffect, useRef, type PointerEvent, type MouseEvent } from "react";
import type { LoopSegment } from "../playback/types";
import { translateSegment } from "../playback/translateSegment";
import { suppressNextClick } from "./suppressNextClick";
import { setPlayerDragLock } from "./playerDragLock";
import { buildTimeMap, type Segment, type TimeMap } from "./chapterMapping";
import { CountInBeacon, type CountInBeat } from "./CountInBeacon";
import { formatTime } from "./formatTime";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
  // Called instead of onSegmentChange when a Shift+handle drag moves the window
  // (start changed). Callers use this to seek the playhead to the new start.
  // Falls back to onSegmentChange when not provided.
  onWindowMove?: (segment: LoopSegment) => void;
  // Live count-in beat, or null when no count is running.
  countIn?: CountInBeat | null;
};

type Handle = "start" | "end";
type DragMode = "resize" | "window";

export function TimelineHandles({ duration, segment, onSegmentChange, onWindowMove, countIn }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const rangeRef = useRef<HTMLDivElement>(null);
  // Time readouts shown above the handle being dragged.
  const startChipRef = useRef<HTMLSpanElement>(null);
  const endChipRef = useRef<HTMLSpanElement>(null);

  const safeDuration = Math.max(duration, 1);

  const committed = segment ?? {
    start: safeDuration * 0.25,
    end: safeDuration * 0.5
  };

  // Time<->position map. On chaptered videos YouTube lays the bar out as
  // gapped per-chapter segments, so position is piecewise in time; mapping
  // linearly drifts the band right of the native playhead. Rebuilt from the
  // live chapter geometry (refreshChapterMap) on mount, resize, and drag start.
  const mapRef = useRef<TimeMap>(buildTimeMap([], safeDuration));

  const readSegments = (): Segment[] => {
    const tl = timelineRef.current;
    if (tl == null) return [];
    const rect = tl.getBoundingClientRect();
    if (rect.width <= 0) return [];
    const lists = tl
      .closest(".ytp-progress-bar")
      ?.querySelectorAll(".ytp-progress-list");
    if (lists == null || lists.length < 2) return [];
    return Array.from(lists, (el) => {
      const r = el.getBoundingClientRect();
      return {
        startFrac: (r.left - rect.left) / rect.width,
        endFrac: (r.right - rect.left) / rect.width
      };
    });
  };

  const refreshChapterMap = () => {
    mapRef.current = buildTimeMap(readSegments(), safeDuration);
  };

  const startPercent = mapRef.current.timeToPercent(committed.start);
  const endPercent = mapRef.current.timeToPercent(committed.end);

  // The handle is 10px wide and positioned by its left edge. Anchoring the nub
  // centre on the percentage would push half of it past the track at 0%/100%,
  // where YouTube's overflow:hidden progress bar clips it and Firefox routes the
  // pointer to the player instead of our (clipped) button — the handle becomes
  // ungrabbable. Offset by half its width and clamp so it always stays inside.
  const handleLeft = (percent: number) =>
    `clamp(0px, calc(${percent}% - 5px), calc(100% - 10px))`;

  // The segment being dragged. Updated via direct DOM (no React render) every
  // pointermove so the handle tracks the cursor smoothly; committed to state
  // only on drop.
  const draggingRef = useRef<Handle | null>(null);
  const liveRef = useRef<LoopSegment>(committed);

  // Per-drag mode: "window" when Shift was held at pointerdown, "resize" otherwise.
  const dragModeRef = useRef<DragMode>("resize");

  // For a window drag: the pointer time and segment captured at grab, so each
  // move is a delta from the grab point rather than absolute.
  const grabTimeRef = useRef(0);
  const grabSegRef = useRef<LoopSegment>(committed);

  const setDragLock = (on: boolean) =>
    setPlayerDragLock(timelineRef.current, on);

  // Commit + clear the drag. Idempotent (guarded by handle) so pointerup and
  // lostpointercapture/pointercancel can both call it. Commits the last painted
  // value so it's correct even when capture was lost off the button.
  const finishDrag = (handle: Handle) => {
    if (draggingRef.current !== handle) {
      return;
    }
    draggingRef.current = null;
    setDragLock(false);
    delete startRef.current?.dataset.dragLive;
    delete endRef.current?.dataset.dragLive;
    // Swallow the click the browser synthesizes after the drag. Must be armed
    // HERE (release), not at pointerdown: the guard self-destructs on the next
    // macrotask, so arming at grab time leaves the real drag-end click — which
    // can land on the video and toggle play/pause — unswallowed.
    suppressNextClick();
    const next = liveRef.current;
    paint(next);
    // A window-mode drag (Shift held at pointerdown) that actually moved the
    // window (start changed) routes through onWindowMove so the caller can seek
    // to the new start. A no-move window drag, or any resize drag, uses
    // onSegmentChange (no seek).
    if (dragModeRef.current === "window" && next.start !== grabSegRef.current.start && onWindowMove != null) {
      onWindowMove(next);
    } else {
      onSegmentChange(next);
    }
    dragModeRef.current = "resize";
  };

  const valueFromPointer = (clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (rect == null || rect.width <= 0) {
      return 0;
    }

    const percent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    return Number(mapRef.current.percentToTime(percent).toFixed(2));
  };

  const clampSegment = (handle: Handle, value: number, from: LoopSegment): LoopSegment => {
    if (handle === "start") {
      return { start: Math.min(value, from.end), end: from.end };
    }
    return { start: from.start, end: Math.max(value, from.start) };
  };

  // Move the handles/range directly so dragging does not trigger a re-render.
  const paint = (seg: LoopSegment) => {
    const start = mapRef.current.timeToPercent(seg.start);
    const end = mapRef.current.timeToPercent(seg.end);

    if (startRef.current) startRef.current.style.left = handleLeft(start);
    if (endRef.current) endRef.current.style.left = handleLeft(end);
    if (rangeRef.current) {
      rangeRef.current.style.left = `${start}%`;
      rangeRef.current.style.width = `${end - start}%`;
    }
    if (startChipRef.current) startChipRef.current.textContent = formatTime(seg.start);
    if (endChipRef.current) endChipRef.current.textContent = formatTime(seg.end);
  };

  // Keep the range highlight synced with committed state. Refresh the chapter
  // map first so a freshly-committed segment paints against current geometry.
  useLayoutEffect(() => {
    refreshChapterMap();
    if (draggingRef.current == null) {
      paint(committed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed.start, committed.end, safeDuration]);

  // Chapter segment pixel widths shift when the bar resizes (theater, fullscreen,
  // sidebar, window) because the inter-chapter gaps are fixed pixels, not
  // proportional. Rebuild the map and repaint so the band tracks the new layout.
  useEffect(() => {
    const tl = timelineRef.current;
    if (tl == null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      refreshChapterMap();
      if (draggingRef.current == null) {
        paint(committed);
      }
    });
    observer.observe(tl);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed.start, committed.end, safeDuration]);

  // Block YouTube's scrubber: it binds mousedown/click on the progress bar.
  const blockMouse = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // Shared move/up body: if this handle is the one being dragged, swallow the
  // event and fold the pointer position into liveRef. Returns whether the drag
  // is live (callers then paint or commit).
  const applyHandleFromPointer = (
    handle: Handle,
    event: PointerEvent<HTMLElement>
  ): boolean => {
    if (draggingRef.current !== handle) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if (dragModeRef.current === "window") {
      const delta = valueFromPointer(event.clientX) - grabTimeRef.current;
      liveRef.current = translateSegment(grabSegRef.current, delta, {
        min: 0,
        max: safeDuration
      });
    } else {
      const value = valueFromPointer(event.clientX);
      liveRef.current = clampSegment(handle, value, liveRef.current);
    }
    return true;
  };

  const createDragHandlers = (handle: Handle) => ({
    onMouseDown: blockMouse,
    onClick: blockMouse,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      // Reveal this handle's time chip for the duration of the drag.
      event.currentTarget.dataset.dragLive = "true";
      // Snapshot current chapter geometry so the drag maps against an accurate
      // layout for its whole duration.
      refreshChapterMap();
      draggingRef.current = handle;
      liveRef.current = committed;
      if (event.shiftKey) {
        dragModeRef.current = "window";
        grabTimeRef.current = valueFromPointer(event.clientX);
        grabSegRef.current = committed;
      } else {
        dragModeRef.current = "resize";
      }
      setDragLock(true);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (applyHandleFromPointer(handle, event)) {
        paint(liveRef.current);
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (applyHandleFromPointer(handle, event)) {
        finishDrag(handle);
      }
    },
    // Capture can end before pointerup (release off the button, pointer leaves
    // the window). lostpointercapture fires for any capture end, so it recovers
    // the stuck-drag case and no-ops on the normal release (guarded).
    onLostPointerCapture: () => {
      finishDrag(handle);
    },
    onPointerCancel: () => {
      finishDrag(handle);
    }
  });

  return (
    <div
      ref={timelineRef}
      className="you-loop-timeline"
      data-testid="timeline-handles"
    >
      <div
        ref={rangeRef}
        className="you-loop-loop-range"
        style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
      />
      <button
        ref={startRef}
        aria-label="Loop start"
        className="you-loop-handle"
        data-edge="start"
        type="button"
        style={{ left: handleLeft(startPercent) }}
        {...createDragHandlers("start")}
      >
        <span ref={startChipRef} className="you-loop-handle-chip" aria-hidden="true" />
      </button>
      <button
        ref={endRef}
        aria-label="Loop end"
        className="you-loop-handle"
        data-edge="end"
        type="button"
        style={{ left: handleLeft(endPercent) }}
        {...createDragHandlers("end")}
      >
        <span ref={endChipRef} className="you-loop-handle-chip" aria-hidden="true" />
      </button>
      {countIn != null && (
        <CountInBeacon
          beat={countIn}
          leftPercent={mapRef.current.timeToPercent(countIn.timeSec)}
        />
      )}
    </div>
  );
}
