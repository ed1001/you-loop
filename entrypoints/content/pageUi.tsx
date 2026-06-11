import { createRoot, type Root } from "react-dom/client";
import { findYouTubeVideo } from "../../adapters/youtube/adapter";
import {
  createInitialPlaybackState,
  playbackReducer
} from "../../features/playback/reducer";
import type { PlaybackState } from "../../features/playback/types";
import { TimelineHandles } from "../../features/player-overlay/TimelineHandles";

const PAGE_UI_SELECTOR = "[data-you-loop-page-ui]";
const PAGE_UI_STYLE_SELECTOR = "style[data-you-loop-page-ui-style]";

type MountedPageUi = {
  root: Root;
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

  const render = () => {
    root.render(
      <TimelineHandles
        duration={getVideoDuration(video)}
        segment={state.loopSegment}
        onSegmentChange={(segment) => {
          state = playbackReducer(state, { type: "setLoopSegment", segment });
          render();
        }}
      />
    );
  };

  render();
  return root;
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

  mountedPageUis.set(panel, {
    root: renderTimelineCursors(panel, video),
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
    mounted?.root.unmount();
    mounted?.cleanup();
    mountedPageUis.delete(existing);
    existing.remove();
  }
}
