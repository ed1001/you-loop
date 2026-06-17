import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type PointerEvent
} from "react";
import type { LoopSegment } from "../playback/types";
import { MIN_SEGMENT_DURATION_SECONDS } from "../playback/reducer";
import { suppressNextClick } from "./suppressNextClick";
import { setPlayerDragLock } from "./playerDragLock";

// Hovering the zoom strip must not bubble into YouTube's scrubber (it would pop
// the timeline preview). Stop move/hover events without preventDefault.
const swallowMove = (event: MouseEvent | PointerEvent) => {
  event.stopPropagation();
};

type Props = {
  video: HTMLVideoElement;
  // The magnified window the timeline spans (the loop plus padding). Driven by
  // the main timeline handles.
  window: LoopSegment;
  // The actual loop, refined by the cursors in here. Playback obeys this.
  loop: LoopSegment;
  onLoopChange: (loop: LoopSegment) => void;
  // Plays the exit animation while the strip is unmounting.
  closing?: boolean;
};

type Edge = "start" | "end";

// mm:ss, or h:mm:ss past an hour.
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// A magnified timeline that spans the zoom window across its whole width. The
// loop cursors inside refine the loop with high precision; the playhead is
// draggable to scrub the video within the window.
export function ZoomTimeline({
  video,
  window: win,
  loop,
  onLoopChange,
  closing = false
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  const winSpan = Math.max(win.end - win.start, 0.001);

  // Playhead scrub state.
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const seekRafRef = useRef(0);
  // Last time the scrub painted to, so cleanup can commit without re-reading the
  // pointer — correct even when capture is lost off-element (no usable event).
  const lastScrubTimeRef = useRef<number | null>(null);

  // Loop-cursor drag state.
  const draggingEdgeRef = useRef<Edge | null>(null);
  const liveLoopRef = useRef<LoopSegment>(loop);

  const pct = (time: number) =>
    Math.min(100, Math.max(0, ((time - win.start) / winSpan) * 100));

  // Paint the playhead directly so dragging/playback do not re-render.
  const paintPlayhead = (time: number) => {
    const el = playheadRef.current;
    if (el == null) {
      return;
    }

    if (time < win.start || time > win.end) {
      el.style.opacity = "0";
      return;
    }

    el.style.opacity = "1";
    el.style.left = `${pct(time)}%`;
  };

  // Paint the loop cursors and the highlighted loop fill between them.
  const paintLoop = (seg: LoopSegment) => {
    const startPct = pct(seg.start);
    const endPct = pct(seg.end);
    if (startRef.current) startRef.current.style.left = `${startPct}%`;
    if (endRef.current) endRef.current.style.left = `${endPct}%`;
    if (fillRef.current) {
      fillRef.current.style.left = `${startPct}%`;
      fillRef.current.style.width = `${endPct - startPct}%`;
    }
  };

  // Keep the loop cursors synced with committed props (window pan/resize, loop
  // changes) unless the user is actively dragging a cursor.
  useLayoutEffect(() => {
    if (draggingEdgeRef.current == null) {
      paintLoop(loop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.start, loop.end, win.start, win.end]);

  // Follow playback unless the user is scrubbing. `timeupdate` only fires
  // ~4x/sec, so drive the playhead off requestAnimationFrame for smooth 60fps
  // motion; only run the loop while the video is actually playing.
  useEffect(() => {
    let raf = 0;

    const frame = () => {
      if (!scrubbingRef.current) {
        paintPlayhead(video.currentTime);
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf === 0) {
        raf = requestAnimationFrame(frame);
      }
    };

    const stop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const paintIfIdle = () => {
      if (!scrubbingRef.current) {
        paintPlayhead(video.currentTime);
      }
    };

    paintPlayhead(video.currentTime);
    if (!video.paused) {
      start();
    }

    video.addEventListener("play", start);
    video.addEventListener("playing", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    video.addEventListener("seeked", paintIfIdle);

    return () => {
      stop();
      if (seekRafRef.current !== 0) {
        cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = 0;
      }
      video.removeEventListener("play", start);
      video.removeEventListener("playing", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
      video.removeEventListener("seeked", paintIfIdle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, win.start, win.end]);

  // Map a pointer's clientX to a time, clamped to the window. Vertical position
  // is never read, so the drag ignores it; horizontal travel past an edge pins
  // to that edge instead of running off the strip.
  const timeFromPointer = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect == null || rect.width <= 0) {
      return win.start;
    }
    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return win.start + percent * winSpan;
  };

  const setDragLock = (on: boolean) => setPlayerDragLock(trackRef.current, on);

  // pointerup.stopPropagation() does NOT stop the synthesized `click` that
  // follows it — that's a separate event. Left unswallowed it bubbles to
  // YouTube's player and toggles play/pause + its own scrub UI at the release
  // point. Swallow mousedown/click on our interactive surfaces (same guard the
  // main TimelineHandles use).
  const blockMouse = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // --- Playhead scrubbing (clicking/dragging the track itself) ---

  const flushSeek = () => {
    seekRafRef.current = 0;
    if (pendingSeekRef.current != null) {
      video.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = null;
    }
  };

  const queueSeek = (time: number) => {
    pendingSeekRef.current = time;
    if (seekRafRef.current === 0) {
      seekRafRef.current = requestAnimationFrame(flushSeek);
    }
  };

  const scrubTo = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const time = timeFromPointer(event.clientX);
    lastScrubTimeRef.current = time;
    paintPlayhead(time);
    queueSeek(time);
  };

  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = true;
    suppressNextClick();
    setDragLock(true);
    // Pause while scrubbing (like the native bar) so frames step under the
    // finger instead of fighting live playback; resume on release.
    wasPlayingRef.current = !video.paused;
    video.pause();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // keep the drag alive uncaptured
    }
    scrubTo(event);
  };

  const onTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubTo(event);
  };

  // Commit and clear the scrub. Idempotent (guarded by scrubbingRef) so it can
  // run from pointerup AND from lostpointercapture/pointercancel without
  // double-firing. Commits lastScrubTimeRef rather than re-reading the pointer,
  // so it's correct even when capture was lost off-element. No releasePointer-
  // Capture: capture is implicitly released on pointerup (same as the cursors).
  const finishScrub = () => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubbingRef.current = false;
    setDragLock(false);

    if (seekRafRef.current !== 0) {
      cancelAnimationFrame(seekRafRef.current);
      seekRafRef.current = 0;
    }
    const time = lastScrubTimeRef.current ?? video.currentTime;
    video.currentTime = time;
    paintPlayhead(time);
    if (wasPlayingRef.current) {
      void video.play();
    }
  };

  const endScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // Fold in the precise release point before committing.
    lastScrubTimeRef.current = timeFromPointer(event.clientX);
    finishScrub();
  };

  // --- Loop cursor dragging (refines the loop within the window) ---

  const clampEdge = (edge: Edge, value: number, from: LoopSegment): LoopSegment => {
    const min = MIN_SEGMENT_DURATION_SECONDS;
    if (edge === "start") {
      const start = Math.min(
        Math.max(value, win.start),
        from.end - min
      );
      return { start, end: from.end };
    }
    const end = Math.max(Math.min(value, win.end), from.start + min);
    return { start: from.start, end };
  };

  // Commit and clear the drag. Idempotent (guarded by edge) so it can run from
  // pointerup AND from lostpointercapture/pointercancel without double-firing.
  // Commits the last painted value in liveLoopRef rather than re-reading the
  // pointer, so it's correct even when capture was lost off-element.
  const finishCursorDrag = (edge: Edge) => {
    if (draggingEdgeRef.current !== edge) {
      return;
    }
    draggingEdgeRef.current = null;
    setDragLock(false);
    const next = liveLoopRef.current;
    paintLoop(next);
    onLoopChange(next);
  };

  // Shared move/up body: if this edge is the one being dragged, swallow the
  // event and fold the pointer position into liveLoopRef. Returns whether the
  // drag is live (callers then paint or commit).
  const applyEdgeFromPointer = (
    edge: Edge,
    event: PointerEvent<HTMLButtonElement>
  ): boolean => {
    if (draggingEdgeRef.current !== edge) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const value = timeFromPointer(event.clientX);
    liveLoopRef.current = clampEdge(edge, value, liveLoopRef.current);
    return true;
  };

  const createCursorHandlers = (edge: Edge) => ({
    onMouseDown: blockMouse,
    onClick: blockMouse,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // keep the drag alive uncaptured
      }
      suppressNextClick();
      draggingEdgeRef.current = edge;
      liveLoopRef.current = loop;
      setDragLock(true);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (applyEdgeFromPointer(edge, event)) {
        paintLoop(liveLoopRef.current);
      }
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      // Fold in the release point, then commit + clear.
      if (applyEdgeFromPointer(edge, event)) {
        finishCursorDrag(edge);
      }
    },
    // If capture is lost before pointerup (release lands off the button, the
    // pointer leaves the window, etc.) pointerup never fires on us — without
    // this the drag would stay armed and the cursor would track the mouse on
    // the next hover. lostpointercapture fires for ANY capture end, so it also
    // covers the normal release path (guard makes it a no-op then).
    onLostPointerCapture: () => {
      finishCursorDrag(edge);
    },
    onPointerCancel: () => {
      finishCursorDrag(edge);
    }
  });

  return (
    <div
      className="you-loop-zoom"
      data-testid="zoom-timeline"
      data-closing={closing ? "true" : undefined}
      role="group"
      aria-label={`Loop zoom from ${formatTime(win.start)} to ${formatTime(win.end)}`}
      onPointerMove={swallowMove}
      onMouseMove={swallowMove}
      onMouseOver={swallowMove}
      onMouseOut={swallowMove}
    >
      <span className="you-loop-zoom-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle
            cx="10"
            cy="10"
            r="6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          />
          <path
            d="M14.8 14.8L20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="you-loop-zoom-time">{formatTime(win.start)}</span>
      <div
        ref={trackRef}
        className="you-loop-zoom-track"
        onMouseDown={blockMouse}
        onClick={blockMouse}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        // If capture is lost before pointerup (release lands outside the
        // player, the pointer leaves the window, etc.) pointerup never fires on
        // us — without this the scrub stays armed: the playhead keeps tracking
        // the mouse and the OS cursor stays hidden. Mirrors the loop cursors.
        onLostPointerCapture={finishScrub}
      >
        <div
          ref={fillRef}
          className="you-loop-zoom-fill"
          style={{ left: `${pct(loop.start)}%`, width: `${pct(loop.end) - pct(loop.start)}%` }}
        />
        <button
          ref={startRef}
          type="button"
          aria-label="Loop start"
          className="you-loop-zoom-cursor"
          data-edge="start"
          style={{ left: `${pct(loop.start)}%` }}
          {...createCursorHandlers("start")}
        />
        <button
          ref={endRef}
          type="button"
          aria-label="Loop end"
          className="you-loop-zoom-cursor"
          data-edge="end"
          style={{ left: `${pct(loop.end)}%` }}
          {...createCursorHandlers("end")}
        />
        <div
          ref={playheadRef}
          className="you-loop-zoom-playhead"
          role="slider"
          aria-label="Zoom playhead"
          aria-valuemin={Math.round(win.start)}
          aria-valuemax={Math.round(win.end)}
        />
      </div>
      <span className="you-loop-zoom-time">{formatTime(win.end)}</span>
    </div>
  );
}
