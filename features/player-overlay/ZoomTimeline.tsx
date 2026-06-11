import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent
} from "react";
import type { LoopSegment } from "../playback/types";
import { MIN_SEGMENT_DURATION_SECONDS } from "../playback/reducer";

type Props = {
  video: HTMLVideoElement;
  // The magnified window the timeline spans (the loop plus padding). Driven by
  // the main timeline handles.
  window: LoopSegment;
  // The actual loop, refined by the cursors in here. Playback obeys this.
  loop: LoopSegment;
  onLoopChange: (loop: LoopSegment) => void;
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
export function ZoomTimeline({ video, window: win, loop, onLoopChange }: Props) {
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

  const timeFromPointer = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect == null || rect.width <= 0) {
      return win.start;
    }

    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return win.start + percent * winSpan;
  };

  // Keep the controls visible during any drag. Holding the pointer still lets
  // YouTube's idle timer add `.ytp-autohide` and fade `.ytp-chrome-bottom` to
  // opacity 0; our overlay lives inside it, so flag the player and force the
  // chrome bottom back to visible via CSS.
  const setDragLock = (on: boolean) => {
    const track = trackRef.current;
    if (track == null) {
      return;
    }

    const ui = track.closest<HTMLElement>(".you-loop-page-ui");
    const player = track.closest<HTMLElement>(".html5-video-player");

    if (on) {
      if (ui != null) ui.dataset.dragging = "true";
      if (player != null) player.dataset.youLoopScrubbing = "true";
    } else {
      if (ui != null) delete ui.dataset.dragging;
      if (player != null) delete player.dataset.youLoopScrubbing;
    }
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
    paintPlayhead(time);
    queueSeek(time);
  };

  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = true;
    setDragLock(true);
    // Pause while scrubbing (like the native bar) so frames step under the
    // finger instead of fighting live playback; resume on release.
    wasPlayingRef.current = !video.paused;
    video.pause();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubTo(event);
  };

  const onTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubTo(event);
  };

  const endScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubbingRef.current = false;
    setDragLock(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();

    if (seekRafRef.current !== 0) {
      cancelAnimationFrame(seekRafRef.current);
      seekRafRef.current = 0;
    }
    const time = timeFromPointer(event.clientX);
    video.currentTime = time;
    paintPlayhead(time);
    if (wasPlayingRef.current) {
      void video.play();
    }
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

  const createCursorHandlers = (edge: Edge) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingEdgeRef.current = edge;
      liveLoopRef.current = loop;
      setDragLock(true);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (draggingEdgeRef.current !== edge) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const value = timeFromPointer(event.clientX);
      liveLoopRef.current = clampEdge(edge, value, liveLoopRef.current);
      paintLoop(liveLoopRef.current);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (draggingEdgeRef.current !== edge) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.releasePointerCapture(event.pointerId);
      draggingEdgeRef.current = null;
      setDragLock(false);

      const value = timeFromPointer(event.clientX);
      const next = clampEdge(edge, value, liveLoopRef.current);
      paintLoop(next);
      onLoopChange(next);
    }
  });

  return (
    <div
      className="you-loop-zoom"
      data-testid="zoom-timeline"
      role="group"
      aria-label={`Loop zoom from ${formatTime(win.start)} to ${formatTime(win.end)}`}
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
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
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
