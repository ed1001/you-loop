import { createRoot, type Root } from "react-dom/client";
import { findYouTubeVideo } from "../../adapters/youtube/adapter";
import {
  createInitialPlaybackState,
  playbackReducer
} from "../../features/playback/reducer";
import { enforceSegmentEnd } from "../../features/playback/controller";
import type { LoopSegment, PlaybackState } from "../../features/playback/types";
import { TimelineHandles } from "../../features/player-overlay/TimelineHandles";
import { ZoomTimeline } from "../../features/player-overlay/ZoomTimeline";
import { clampLoopToRegion } from "../../features/player-overlay/zoomRegion";
import { LoopPanel } from "../../features/player-overlay/LoopPanel";

const PAGE_UI_SELECTOR = "[data-you-loop-page-ui]";
const PAGE_UI_STYLE_SELECTOR = "style[data-you-loop-page-ui-style]";
// Must match the you-loop-zoom-out animation duration in the stylesheet.
const ZOOM_EXIT_MS = 220;

type MountedPageUi = {
  root: Root;
  stop: () => void;
  cleanup: () => void;
};

const mountedPageUis = new WeakMap<Element, MountedPageUi>();

function getVideoDuration(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 1;
}

function renderTimelineCursors(container: Element, video: HTMLVideoElement) {
  const root = createRoot(container);
  let state: PlaybackState = createInitialPlaybackState();
  let zoomed = false;
  // The refined sub-region while zoomed. The zoom timeline spans the main loop
  // (state.loopSegment); the zoom cursors pick a sub-region inside it. Playback
  // obeys this only while zoom is active — turning magnify off reverts to the
  // main loop.
  let zoomLoop: LoopSegment | null = null;
  // Kept mounted briefly after magnify turns off so the zoom strip can play its
  // exit animation before unmounting.
  let zoomClosing = false;
  let zoomCloseTimer = 0;

  // The loop playback actually obeys: the zoom sub-region while magnified,
  // otherwise the main loop.
  const effectiveSegment = (): LoopSegment | null =>
    zoomed && zoomLoop != null ? zoomLoop : state.loopSegment;

  // Turn the loop on, seeding a default segment if none has been set yet.
  const enableLoop = () => {
    if (state.loopSegment == null) {
      const duration = getVideoDuration(video);
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: { start: duration * 0.25, end: duration * 0.5 }
      });
    }
    state = playbackReducer(state, { type: "setLoopEnabled", enabled: true });
  };

  const clearZoomCloseTimer = () => {
    if (zoomCloseTimer !== 0) {
      window.clearTimeout(zoomCloseTimer);
      zoomCloseTimer = 0;
    }
  };

  const toggleLoop = () => {
    if (state.loopEnabled) {
      // Turning the loop off also closes the zoom timeline (no exit animation:
      // the whole control is collapsing).
      clearZoomCloseTimer();
      zoomed = false;
      zoomClosing = false;
      zoomLoop = null;
      state = playbackReducer(state, { type: "setLoopEnabled", enabled: false });
    } else {
      enableLoop();
    }
    render();
  };

  // Loop and one-shot are mutually exclusive; the controls are disabled while
  // the loop is off, so these only fire when it is on.
  const toggleMode = () => {
    state = playbackReducer(state, {
      type: "setPlayMode",
      mode: state.playMode === "loop" ? "one-shot" : "loop"
    });
    render();
  };

  const toggleZoom = () => {
    clearZoomCloseTimer();
    if (zoomed) {
      // Keep the strip mounted for the exit animation, then drop it.
      zoomed = false;
      zoomClosing = true;
      zoomCloseTimer = window.setTimeout(() => {
        zoomClosing = false;
        zoomCloseTimer = 0;
        render();
      }, ZOOM_EXIT_MS);
    } else {
      zoomClosing = false;
      zoomed = true;
      // Keep the zoom cursors across toggles; only seed them to the full extent
      // of the main loop (0–100%) the first time. Re-clamp in case the main
      // loop moved while zoom was off.
      if (state.loopSegment != null) {
        zoomLoop =
          zoomLoop != null
            ? clampLoopToRegion(zoomLoop, state.loopSegment)
            : { ...state.loopSegment };
      }
    }
    render();
  };

  // The main handles always edit the main loop (the window the zoom timeline
  // spans). Slide the zoom sub-region to stay inside it.
  const onMainLoopChange = (segment: LoopSegment) => {
    state = playbackReducer(state, { type: "setLoopSegment", segment });
    if (zoomLoop != null && state.loopSegment != null) {
      zoomLoop = clampLoopToRegion(zoomLoop, state.loopSegment);
    }
    render();
  };

  // The zoom cursors refine the sub-region; it applies to playback only while
  // magnified.
  const onZoomLoopChange = (segment: LoopSegment) => {
    zoomLoop = segment;
    render();
  };

  const render = () => {
    const duration = getVideoDuration(video);
    const zoomVisible =
      (zoomed || zoomClosing) &&
      state.loopEnabled &&
      state.loopSegment != null &&
      zoomLoop != null;

    root.render(
      <>
        {zoomVisible && (
          <ZoomTimeline
            video={video}
            window={state.loopSegment!}
            loop={zoomLoop!}
            onLoopChange={onZoomLoopChange}
            closing={zoomClosing}
          />
        )}
        {state.loopEnabled && (
          <TimelineHandles
            duration={duration}
            segment={state.loopSegment}
            onSegmentChange={onMainLoopChange}
          />
        )}
        <LoopPanel
          enabled={state.loopEnabled}
          mode={state.playMode}
          zoomed={zoomed}
          onToggleEnabled={toggleLoop}
          onToggleMode={toggleMode}
          onToggleZoom={toggleZoom}
        />
      </>
    );
  };

  // Loop the video back to the segment start (or pause for one-shot) as
  // playback crosses the segment end. Also restarts a finished one-shot from
  // the segment start when the user presses play again. No-op until a segment
  // is set.
  const onTimeUpdate = () => {
    const result = enforceSegmentEnd(video, {
      ...state,
      loopSegment: effectiveSegment()
    });
    if (result.oneShotCompleted !== state.oneShotCompleted) {
      state = playbackReducer(state, {
        type: "markOneShotCompleted",
        completed: result.oneShotCompleted
      });
    }
  };

  video.addEventListener("timeupdate", onTimeUpdate);
  render();

  return {
    root,
    stop: () => {
      clearZoomCloseTimer();
      video.removeEventListener("timeupdate", onTimeUpdate);
    }
  };
}

function findYouTubeTimeline(video: HTMLVideoElement): HTMLElement | null {
  const player = video.closest(".html5-video-player");
  return player?.querySelector(".ytp-progress-bar") as HTMLElement | null;
}

function ensureDocumentStyles() {
  if (document.querySelector(PAGE_UI_STYLE_SELECTOR) != null) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.youLoopPageUiStyle = "true";
  style.textContent = `
    .you-loop-page-ui {
      inset: 0;
      overflow: visible;
      pointer-events: none;
      position: absolute;
      opacity: 1;
      transition: opacity 0.25s cubic-bezier(0, 0, 0.2, 1);
    }

    .you-loop-page-ui[data-hidden="true"] {
      opacity: 0;
    }

    /* While scrubbing the zoom timeline, stay visible even if YouTube autohides
       its controls (e.g. idle timer firing while the pointer is held still). */
    .you-loop-page-ui[data-dragging="true"] {
      opacity: 1;
    }

    /* Our overlay lives inside .ytp-chrome-bottom; if YouTube fades that parent,
       the overlay fades with it. Force it (and the bottom gradient) visible
       while scrubbing the zoom timeline. */
    .html5-video-player[data-you-loop-scrubbing="true"] .ytp-chrome-bottom,
    .html5-video-player[data-you-loop-scrubbing="true"] .ytp-gradient-bottom {
      opacity: 1 !important;
    }

    .you-loop-timeline {
      height: 100%;
      margin: 0;
      pointer-events: none;
      position: relative;
      width: 100%;
    }

    /* Teal band over the progress bar marking the loop segment. */
    .you-loop-loop-range {
      background: rgba(20, 184, 166, 0.55);
      border-radius: 1px;
      height: 9px;
      pointer-events: none;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }

    .you-loop-handle {
      background: #14b8a6;
      border: 2px solid #ffffff;
      border-radius: 6px;
      box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.6), 0 2px 8px rgba(0, 0, 0, 0.35);
      cursor: ew-resize;
      height: 24px;
      margin: 0;
      padding: 0;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      transform: translate(-50%, -50%);
      width: 10px;
      z-index: 2147483647;
    }

    .you-loop-panel {
      align-items: center;
      background: rgba(38, 38, 42, 0.9);
      border-radius: 999px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      display: flex;
      gap: 6px;
      left: 50%;
      padding: 4px;
      pointer-events: auto;
      position: absolute;
      top: 100%;
      transform: translate(-50%, 12px);
      z-index: 2147483647;
    }

    /* Power toggle: enables/disables the loop range. Icon only. */
    .you-loop-power {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease;
      width: 30px;
    }

    .you-loop-power svg {
      height: 17px;
      width: 17px;
    }

    .you-loop-power:hover {
      color: rgba(255, 255, 255, 0.85);
    }

    .you-loop-power[data-on="true"] {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    /* Segmented mode control: a recessed well groups the two mutually
       exclusive options (loop vs one-shot). */
    .you-loop-modes {
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 2px;
      padding: 2px;
      transition: opacity 0.18s ease;
    }

    /* Dimmed and inert while the loop is off. */
    .you-loop-modes[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-mode-option:disabled,
    .you-loop-zoom-toggle:disabled {
      cursor: default;
    }

    .you-loop-mode-option {
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.62);
      cursor: pointer;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      padding: 7px 14px;
      text-transform: uppercase;
      transition: background 0.18s ease, color 0.18s ease;
    }

    .you-loop-mode-option:not(:disabled):hover {
      color: rgba(255, 255, 255, 0.92);
    }

    .you-loop-mode-option[data-active="true"] {
      background: #14b8a6;
      color: #0a0a0a;
    }

    /* Magnifying-glass toggle for the zoom timeline. */
    .you-loop-zoom-toggle {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease;
      width: 30px;
    }

    .you-loop-zoom-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-zoom-toggle:not(:disabled):hover {
      color: rgba(255, 255, 255, 0.85);
    }

    .you-loop-zoom-toggle[data-on="true"] {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    /* Dimmed while the loop is off, but still clickable: interacting turns it on. */
    .you-loop-zoom-toggle[data-disabled="true"] {
      opacity: 0.4;
    }

    /* Full-width timeline floating above the native scrubber, mapping just the
       loop range across its whole width. */
    .you-loop-zoom {
      align-items: center;
      animation: you-loop-zoom-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      bottom: 100%;
      display: flex;
      gap: 10px;
      left: 0;
      margin-bottom: 30px;
      pointer-events: none;
      position: absolute;
      transform-origin: center bottom;
      width: 100%;
    }

    @keyframes you-loop-zoom-in {
      from {
        opacity: 0;
        transform: translateY(8px) scaleY(0.55);
      }
      to {
        opacity: 1;
        transform: translateY(0) scaleY(1);
      }
    }

    /* Reverse of the entrance, played while the strip unmounts. */
    .you-loop-zoom[data-closing="true"] {
      animation: you-loop-zoom-out 0.22s cubic-bezier(0.7, 0, 0.84, 0) forwards;
      pointer-events: none;
    }

    @keyframes you-loop-zoom-out {
      from {
        opacity: 1;
        transform: translateY(0) scaleY(1);
      }
      to {
        opacity: 0;
        transform: translateY(8px) scaleY(0.55);
      }
    }

    /* Magnifying-glass badge marking this strip as the zoomed timeline. */
    .you-loop-zoom-badge {
      align-items: center;
      background: radial-gradient(
        circle at 50% 50%,
        rgba(20, 184, 166, 0.28),
        rgba(20, 184, 166, 0.08)
      );
      border: 1px solid rgba(94, 234, 212, 0.45);
      border-radius: 50%;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45),
        0 0 14px rgba(20, 184, 166, 0.35);
      color: #5eead4;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      width: 30px;
    }

    .you-loop-zoom-badge svg {
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
      height: 22px;
      width: 22px;
    }

    .you-loop-zoom-time {
      color: #5eead4;
      flex: none;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    }

    .you-loop-zoom-track {
      background: linear-gradient(
        180deg,
        rgba(20, 184, 166, 0.16),
        rgba(20, 184, 166, 0.3)
      );
      border: 1px solid rgba(94, 234, 212, 0.45);
      border-radius: 3px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5),
        inset 0 0 0 1px rgba(0, 0, 0, 0.25);
      cursor: ew-resize;
      flex: 1;
      height: 10px;
      pointer-events: auto;
      position: relative;
      touch-action: none;
    }

    /* Faint tick hatch for a sense of magnified scale. */
    .you-loop-zoom-track::before {
      background-image: repeating-linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.1) 0 1px,
        transparent 1px 24px
      );
      content: "";
      inset: 0;
      position: absolute;
    }

    .you-loop-zoom-playhead {
      background: #f8fafc;
      border-radius: 3px;
      box-shadow: 0 0 7px rgba(94, 234, 212, 0.95),
        0 0 0 1px rgba(8, 12, 14, 0.55);
      height: 100%;
      left: 0;
      pointer-events: none;
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      transition: opacity 0.15s ease, box-shadow 0.15s ease;
      width: 5px;
      will-change: left;
      /* Sit above the loop cursors so it stays visible behind them. */
      z-index: 3;
    }

    /* Grab knob sitting above the playhead bar. */
    .you-loop-zoom-playhead::after {
      background: #f8fafc;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.5),
        0 1px 4px rgba(0, 0, 0, 0.5);
      content: "";
      height: 11px;
      left: 50%;
      position: absolute;
      top: -7px;
      transform: translateX(-50%);
      width: 11px;
    }

    .you-loop-zoom-track:hover .you-loop-zoom-playhead,
    .you-loop-zoom-track:active .you-loop-zoom-playhead {
      box-shadow: 0 0 10px rgba(94, 234, 212, 1);
    }

    /* Highlighted loop region between the two zoom cursors. */
    .you-loop-zoom-fill {
      background: linear-gradient(
        180deg,
        rgba(94, 234, 212, 0.45),
        rgba(20, 184, 166, 0.6)
      );
      border-radius: 2px;
      box-shadow: inset 0 0 0 1px rgba(94, 234, 212, 0.55);
      height: 100%;
      pointer-events: none;
      position: absolute;
      top: 0;
      will-change: left, width;
    }

    /* Loop refine cursors: taller teal handles straddling the track. */
    .you-loop-zoom-cursor {
      background: #14b8a6;
      border: 2px solid #ffffff;
      border-radius: 4px;
      box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.6),
        0 2px 8px rgba(0, 0, 0, 0.45);
      cursor: ew-resize;
      height: 20px;
      margin: 0;
      padding: 0;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      transform: translate(-50%, -50%);
      width: 8px;
      will-change: left;
      z-index: 2;
    }

    .you-loop-zoom-cursor:hover {
      box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.8),
        0 0 10px rgba(94, 234, 212, 0.85);
    }

    /* While hovering the zoom track, suppress YouTube's "most replayed" heatmap
       so it does not pop up and obscure the zoom timeline. */
    .html5-video-player:has(.you-loop-zoom-track:hover) .ytp-heat-map-container,
    .html5-video-player:has(.you-loop-zoom-track:hover) .ytp-heat-map-edu {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  document.head.append(style);
}

function watchTimeline(video: HTMLVideoElement, onTimeline: (timeline: HTMLElement) => void) {
  const sync = () => {
    const timeline = findYouTubeTimeline(video);
    if (timeline == null) {
      return;
    }

    onTimeline(timeline);
  };

  sync();

  const player = video.closest(".html5-video-player");
  const observer = new MutationObserver(sync);
  observer.observe(player ?? document.body, {
    childList: true,
    subtree: true
  });

  return () => observer.disconnect();
}

// Mirror YouTube control fade: it toggles `.ytp-autohide` on the player root.
function watchAutohide(video: HTMLVideoElement, panel: HTMLElement) {
  const player = video.closest(".html5-video-player");
  if (player == null) {
    return () => {};
  }

  const sync = () => {
    panel.dataset.hidden = player.classList.contains("ytp-autohide")
      ? "true"
      : "false";
  };

  sync();

  const observer = new MutationObserver(sync);
  observer.observe(player, {
    attributes: true,
    attributeFilter: ["class"]
  });

  return () => observer.disconnect();
}

export function createPageUiElement(video: HTMLVideoElement) {
  ensureDocumentStyles();

  const panel = document.createElement("div");
  panel.dataset.youLoopPageUi = "true";
  panel.className = "you-loop-page-ui";

  const stopTimeline = watchTimeline(video, (timeline) => {
    if (getComputedStyle(timeline).position === "static") {
      timeline.style.position = "relative";
    }

    if (panel.parentElement !== timeline) {
      timeline.append(panel);
    }
  });
  const stopAutohide = watchAutohide(video, panel);
  const { root, stop } = renderTimelineCursors(panel, video);

  mountedPageUis.set(panel, {
    root,
    stop,
    cleanup: () => {
      stopTimeline();
      stopAutohide();
    }
  });

  return panel;
}

export function setPageUiVisible(_host: Element, visible: boolean) {
  const existing = document.querySelector(PAGE_UI_SELECTOR);

  if (visible && existing == null) {
    const video = findYouTubeVideo();
    if (video == null) {
      return;
    }

    const timeline = findYouTubeTimeline(video);
    if (timeline == null) {
      return;
    }

    timeline.append(createPageUiElement(video));
    return;
  }

  if (!visible && existing != null) {
    const mounted = mountedPageUis.get(existing);
    mounted?.stop();
    mounted?.root.unmount();
    mounted?.cleanup();
    mountedPageUis.delete(existing);
    existing.remove();
  }
}
