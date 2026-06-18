import { useLayoutEffect, useRef, type PointerEvent, type MouseEvent } from "react";
import type { LoopSegment } from "../playback/types";
import { translateSegment } from "../playback/translateSegment";
import { suppressNextClick } from "./suppressNextClick";
import { setPlayerDragLock } from "./playerDragLock";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
  // Called instead of onSegmentChange when a Shift+handle drag moves the window
  // (start changed). Callers use this to seek the playhead to the new start.
  // Falls back to onSegmentChange when not provided.
  onWindowMove?: (segment: LoopSegment) => void;
};

type Handle = "start" | "end";
type DragMode = "resize" | "window";

export function TimelineHandles({ duration, segment, onSegmentChange, onWindowMove }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const rangeRef = useRef<HTMLDivElement>(null);

  const safeDuration = Math.max(duration, 1);

  const committed = segment ?? {
    start: safeDuration * 0.25,
    end: safeDuration * 0.5
  };

  const startPercent = (committed.start / safeDuration) * 100;
  const endPercent = (committed.end / safeDuration) * 100;

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

    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Number((percent * safeDuration).toFixed(2));
  };

  const clampSegment = (handle: Handle, value: number, from: LoopSegment): LoopSegment => {
    if (handle === "start") {
      return { start: Math.min(value, from.end), end: from.end };
    }
    return { start: from.start, end: Math.max(value, from.start) };
  };

  // Move the handles/range directly so dragging does not trigger a re-render.
  const paint = (seg: LoopSegment) => {
    const start = (seg.start / safeDuration) * 100;
    const end = (seg.end / safeDuration) * 100;

    if (startRef.current) startRef.current.style.left = handleLeft(start);
    if (endRef.current) endRef.current.style.left = handleLeft(end);
    if (rangeRef.current) {
      rangeRef.current.style.left = `${start}%`;
      rangeRef.current.style.width = `${end - start}%`;
    }
  };

  // Keep the range highlight synced with committed state (and resize).
  useLayoutEffect(() => {
    if (draggingRef.current == null) {
      paint(committed);
    }
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
      suppressNextClick();
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
        type="button"
        style={{ left: handleLeft(startPercent) }}
        {...createDragHandlers("start")}
      />
      <button
        ref={endRef}
        aria-label="Loop end"
        className="you-loop-handle"
        type="button"
        style={{ left: handleLeft(endPercent) }}
        {...createDragHandlers("end")}
      />
    </div>
  );
}
