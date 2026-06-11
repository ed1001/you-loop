import { createRoot, type Root } from "react-dom/client";
import { findYouTubeVideo } from "../../adapters/youtube/adapter";
import {
  createInitialPlaybackState,
  playbackReducer
} from "../../features/playback/reducer";
import { enforceSegmentEnd } from "../../features/playback/controller";
import type { PlaybackState } from "../../features/playback/types";
import { TimelineHandles } from "../../features/player-overlay/TimelineHandles";
import { LoopSwitch } from "../../features/player-overlay/LoopSwitch";

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
        <LoopSwitch enabled={state.loopEnabled} onToggle={toggleLoop} />
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
      z-index: 2147483647;
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

    .you-loop-loop-range {
      position: absolute;
      top: 50%;
      height: 6px;
      transform: translateY(-50%);
      background: rgba(20, 184, 166, 0.45);
      border-radius: 3px;
      pointer-events: none;
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
    }

    .you-loop-panel {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translate(-50%, 12px);
      pointer-events: auto;
    }

    .you-loop-switch {
      align-items: center;
      background: rgba(15, 15, 15, 0.82);
      border: 0;
      border-radius: 999px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
      color: #f1f1f1;
      cursor: pointer;
      display: inline-flex;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 12px;
      font-weight: 600;
      gap: 8px;
      letter-spacing: 0.03em;
      padding: 6px 14px 6px 8px;
      text-transform: uppercase;
    }

    .you-loop-switch-track {
      background: rgba(255, 255, 255, 0.28);
      border-radius: 999px;
      flex: none;
      height: 18px;
      position: relative;
      transition: background 0.18s ease;
      width: 32px;
    }

    .you-loop-switch-thumb {
      background: #ffffff;
      border-radius: 50%;
      height: 14px;
      left: 2px;
      position: absolute;
      top: 2px;
      transition: transform 0.18s ease;
      width: 14px;
    }

    .you-loop-switch[data-on="true"] .you-loop-switch-track {
      background: #14b8a6;
    }

    .you-loop-switch[data-on="true"] .you-loop-switch-thumb {
      transform: translateX(14px);
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
