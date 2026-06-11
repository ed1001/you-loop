import { createRoot, type Root } from "react-dom/client";
import { findYouTubeVideo } from "../../adapters/youtube/adapter";
import {
  createInitialPlaybackState,
  playbackReducer
} from "../../features/playback/reducer";
import { enforceSegmentEnd } from "../../features/playback/controller";
import type { PlaybackState } from "../../features/playback/types";
import { TimelineHandles } from "../../features/player-overlay/TimelineHandles";
import { LoopPanel } from "../../features/player-overlay/LoopPanel";

const PAGE_UI_SELECTOR = "[data-you-loop-page-ui]";
const PAGE_UI_STYLE_SELECTOR = "style[data-you-loop-page-ui-style]";

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

  const toggleLoop = () => {
    const nextEnabled = !state.loopEnabled;

    // Seed a default segment so turning loop on has something to loop.
    if (nextEnabled && state.loopSegment == null) {
      const duration = getVideoDuration(video);
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: { start: duration * 0.25, end: duration * 0.5 }
      });
    }

    state = playbackReducer(state, {
      type: "setLoopEnabled",
      enabled: nextEnabled
    });
    render();
  };

  const toggleMode = () => {
    state = playbackReducer(state, {
      type: "setPlayMode",
      mode: state.playMode === "loop" ? "one-shot" : "loop"
    });
    render();
  };

  const render = () => {
    root.render(
      <>
        <TimelineHandles
          duration={getVideoDuration(video)}
          segment={state.loopSegment}
          onSegmentChange={(segment) => {
            state = playbackReducer(state, { type: "setLoopSegment", segment });
            render();
          }}
        />
        <LoopPanel
          enabled={state.loopEnabled}
          mode={state.playMode}
          onToggleEnabled={toggleLoop}
          onToggleMode={toggleMode}
        />
      </>
    );
  };

  // Loop the video back to the segment start (or pause for one-shot) as
  // playback crosses the segment end. No-op until a segment is set.
  const onTimeUpdate = () => {
    const result = enforceSegmentEnd(video, state);
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
    stop: () => video.removeEventListener("timeupdate", onTimeUpdate)
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
      background: rgba(15, 15, 15, 0.86);
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

    /* Segmented mode control: both options always visible. */
    .you-loop-modes {
      display: flex;
      gap: 2px;
      transition: opacity 0.18s ease;
    }

    .you-loop-modes[data-disabled="true"] {
      opacity: 0.4;
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

    .you-loop-mode-option:hover {
      color: rgba(255, 255, 255, 0.92);
    }

    .you-loop-mode-option[data-active="true"] {
      background: #14b8a6;
      color: #0a0a0a;
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
