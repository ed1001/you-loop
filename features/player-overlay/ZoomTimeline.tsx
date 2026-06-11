import { useEffect, useRef, type PointerEvent } from "react";
import type { LoopSegment } from "../playback/types";

type Props = {
  video: HTMLVideoElement;
  duration: number;
  segment: LoopSegment | null;
};

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

// A full-width timeline that maps just the loop range across its whole width,
// "zooming in" on it. Useful for fine seeking inside very long videos. The
// playhead is draggable: dragging (or clicking the track) scrubs the video
// within the zoomed range. Loop cursors will live in here later.
export function ZoomTimeline({ video, duration, segment }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const safeDuration = Math.max(duration, 1);
  const range = segment ?? {
    start: safeDuration * 0.25,
    end: safeDuration * 0.5
  };
  const span = Math.max(range.end - range.start, 0.001);

  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const seekRafRef = useRef(0);

  // Paint the playhead directly so dragging/playback do not re-render.
  const paint = (time: number) => {
    const el = playheadRef.current;
    if (el == null) {
      return;
    }

    if (time < range.start || time > range.end) {
      el.style.opacity = "0";
      return;
    }

    el.style.opacity = "1";
    el.style.left = `${((time - range.start) / span) * 100}%`;
  };

  // Follow playback unless the user is actively scrubbing. `timeupdate` only
  // fires ~4x/sec, so drive the playhead off requestAnimationFrame for smooth
  // 60fps motion; only run the loop while the video is actually playing.
  useEffect(() => {
    let raf = 0;

    const frame = () => {
      if (!draggingRef.current) {
        paint(video.currentTime);
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

    // Keep the playhead correct while paused (scrubbing the native bar, seeks).
    const paintIfIdle = () => {
      if (!draggingRef.current) {
        paint(video.currentTime);
      }
    };

    paint(video.currentTime);
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
  }, [video, range.start, range.end, span]);

  const timeFromPointer = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect == null || rect.width <= 0) {
      return range.start;
    }

    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return range.start + percent * span;
  };

  // Coalesce seeks to one per animation frame: a media element seek is heavy,
  // and firing one on every pointermove backs them up and stutters. Keep the
  // latest requested time, apply it on the next frame.
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

  // The zoom timeline lives inside YouTube's progress bar; swallow events so
  // the native scrubber does not also seek.
  const scrubTo = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const time = timeFromPointer(event.clientX);
    paint(time); // move the handle immediately so it tracks the finger
    queueSeek(time); // seek the video at most once per frame
  };

  // Keep the controls visible during a drag. Holding the pointer still (no
  // mousemove) lets YouTube's idle timer fire ~3s in, which adds `.ytp-autohide`
  // and fades `.ytp-chrome-bottom` to opacity 0. Our overlay lives inside that
  // element, so a parent's opacity wins — we have to flag the player and force
  // the chrome bottom (and our overlay) back to visible via CSS.
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

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setDragLock(true);
    // Pause while scrubbing (like the native bar) so frames step under the
    // finger instead of fighting live playback; resume on release.
    wasPlayingRef.current = !video.paused;
    video.pause();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubTo(event);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    scrubTo(event);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    setDragLock(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();

    // Apply the final position immediately, then resume if we were playing.
    if (seekRafRef.current !== 0) {
      cancelAnimationFrame(seekRafRef.current);
      seekRafRef.current = 0;
    }
    const time = timeFromPointer(event.clientX);
    video.currentTime = time;
    paint(time);
    if (wasPlayingRef.current) {
      void video.play();
    }
  };

  return (
    <div
      className="you-loop-zoom"
      data-testid="zoom-timeline"
      role="group"
      aria-label={`Loop zoom from ${formatTime(range.start)} to ${formatTime(range.end)}`}
    >
      <span className="you-loop-zoom-time">{formatTime(range.start)}</span>
      <div
        ref={trackRef}
        className="you-loop-zoom-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          ref={playheadRef}
          className="you-loop-zoom-playhead"
          role="slider"
          aria-label="Zoom playhead"
          aria-valuemin={Math.round(range.start)}
          aria-valuemax={Math.round(range.end)}
        />
      </div>
      <span className="you-loop-zoom-time">{formatTime(range.end)}</span>
    </div>
  );
}
