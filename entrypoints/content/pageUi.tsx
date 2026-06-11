import { createRoot, type Root } from "react-dom/client";
import { findYouTubeVideo, getVideoTitle } from "../../adapters/youtube/adapter";
import {
  createInitialPlaybackState,
  defaultLoopSegment,
  playbackReducer,
  PLAYBACK_RATE_STEP
} from "../../features/playback/reducer";
import {
  applyPlaybackState,
  enforceSegmentEnd
} from "../../features/playback/controller";
import type { LoopSegment, PlaybackState } from "../../features/playback/types";
import { TimelineHandles } from "../../features/player-overlay/TimelineHandles";
import { ZoomTimeline } from "../../features/player-overlay/ZoomTimeline";
import { clampLoopToRegion } from "../../features/player-overlay/zoomRegion";
import { LoopPanel } from "../../features/player-overlay/LoopPanel";
import { createLoopKeyHandlers } from "../../features/playback/shortcuts";
import { HelpModal } from "../../features/player-overlay/HelpModal";
import {
  addLoop,
  listEntries,
  loadEntry,
  removeLoop,
  setLastUsed,
  type SavedLoop,
  type SavedVideo,
  type VideoEntry
} from "../../features/persistence/loopStore";
import { PAGE_UI_STYLES } from "./pageUi.styles";

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

// Two loop segments are equal when both null or both endpoints match.
function segmentsEqual(a: LoopSegment | null, b: LoopSegment | null): boolean {
  if (a == null || b == null) return a === b;
  return a.start === b.start && a.end === b.end;
}

// The save button is live only when the current selection differs from the
// saved loop it came from: no source loop means a fresh, savable selection; an
// exact match (both main and zoom) means there's nothing new to save.
function isLoopDirty(
  source: SavedLoop | undefined,
  segment: LoopSegment | null,
  zoom: LoopSegment | null
): boolean {
  if (segment == null) return false;
  if (source == null) return true;
  return (
    !segmentsEqual(source.main, segment) || !segmentsEqual(source.zoom, zoom)
  );
}

function getVideoDuration(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 1;
}

// True once the video reports a real, finite duration (metadata loaded).
function hasKnownDuration(video: HTMLVideoElement): boolean {
  return Number.isFinite(video.duration) && video.duration > 0;
}

// The watch page's video id, or null off a watch page (saving disabled then).
function currentVideoId(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

function renderTimelineCursors(container: Element, video: HTMLVideoElement) {
  const root = createRoot(container);
  let state: PlaybackState = createInitialPlaybackState();
  let zoomed = false;
  let helpOpen = false;
  // The refined sub-region while zoomed. The zoom timeline spans the main loop
  // (state.loopSegment); the zoom cursors pick a sub-region inside it. Playback
  // obeys this only while zoom is active — turning magnify off reverts to the
  // main loop.
  let zoomLoop: LoopSegment | null = null;
  // Kept mounted briefly after magnify turns off so the zoom strip can play its
  // exit animation before unmounting.
  let zoomClosing = false;
  let zoomCloseTimer = 0;

  // Per-video saved loops, persisted to extension storage.
  let videoId: string | null = currentVideoId();
  let savedLoops: SavedLoop[] = [];
  let selectedLoopId: string | null = null;
  let loopsOpen = false;
  // The cross-video index shown on the modal's "Saved videos" tab. Refreshed
  // when the modal opens and after a save (so the list reflects new titles).
  let savedVideos: SavedVideo[] = [];

  // The loop playback actually obeys: the zoom sub-region while magnified,
  // otherwise the main loop.
  const effectiveSegment = (): LoopSegment | null =>
    zoomed && zoomLoop != null ? zoomLoop : state.loopSegment;

  // Turn the loop on. Positions are normally pre-seeded by loadForVideo; the
  // fallback guards against an unknown-duration race before metadata loads.
  const enableLoop = () => {
    if (state.loopSegment == null) {
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: defaultLoopSegment(getVideoDuration(video))
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
      // Turning the loop off hides the zoom timeline (render gates it on
      // loopEnabled) but keeps `zoomed`/`zoomLoop` so the zoom sub-region
      // resumes when the loop is turned back on, instead of being lost.
      clearZoomCloseTimer();
      zoomClosing = false;
      state = playbackReducer(state, { type: "setLoopEnabled", enabled: false });
      // Speed control is tied to the loop being on: turning the loop off snaps
      // playback back to 1× and hands rate control back to YouTube.
      state = playbackReducer(state, { type: "resetPlaybackRate" });
      applyPlaybackState(video, state);
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

  // Speed control: independent of the loop. Apply the rate straight to the
  // video so it takes effect immediately.
  const stepSpeed = (delta: number) => {
    state = playbackReducer(state, {
      type: "setPlaybackRate",
      rate: Number((state.playbackRate + delta).toFixed(2))
    });
    applyPlaybackState(video, state);
    render();
  };

  const resetSpeed = () => {
    state = playbackReducer(state, { type: "resetPlaybackRate" });
    applyPlaybackState(video, state);
    render();
  };

  // Fresh/unsaved video: seed the default range, no saved-loop selection.
  const seedDefaultLoop = (duration: number) => {
    state = playbackReducer(state, {
      type: "setLoopSegment",
      segment: defaultLoopSegment(duration)
    });
    zoomLoop = null;
    savedLoops = [];
    selectedLoopId = null;
  };

  // Restore the entry's last-used loop (clamping its zoom into the main loop).
  const applySavedEntry = (entry: VideoEntry) => {
    const loop =
      entry.loops.find((l) => l.id === entry.lastUsedId) ?? entry.loops[0];
    savedLoops = entry.loops;
    selectedLoopId = loop.id;
    state = playbackReducer(state, {
      type: "setLoopSegment",
      segment: loop.main
    });
    zoomLoop =
      loop.zoom != null && state.loopSegment != null
        ? clampLoopToRegion(loop.zoom, state.loopSegment)
        : null;
  };

  // Seed or restore positions for the current video. Runs on mount and on
  // navigation. Gated on a known duration so percentage seeding is meaningful.
  const loadForVideo = async () => {
    const id = videoId;
    if (!hasKnownDuration(video)) return; // retried on loadedmetadata
    const duration = getVideoDuration(video);

    if (id == null) {
      seedDefaultLoop(duration);
      render();
      return;
    }

    const entry = await loadEntry(id, undefined, undefined, getVideoTitle() ?? undefined);
    if (videoId !== id) return; // navigated away mid-await

    if (entry != null && entry.loops.length > 0) {
      applySavedEntry(entry);
    } else {
      seedDefaultLoop(duration);
    }
    render();
  };

  const saveAsNew = async (name: string) => {
    if (videoId == null || state.loopSegment == null) return;
    const loop = await addLoop(videoId, name, state.loopSegment, zoomLoop);
    savedLoops = [...savedLoops, loop];
    selectedLoopId = loop.id;
    // Persist the title now so this video shows a name in the index without
    // waiting for a later revisit to backfill it.
    await loadEntry(videoId, undefined, undefined, getVideoTitle() ?? undefined);
    await refreshLibrary();
    // Stay open so the new loop appears in the list as confirmation.
    render();
  };

  // Reload the cross-video index from storage.
  const refreshLibrary = async () => {
    savedVideos = await listEntries();
    render();
  };

  // Jump to another saved video; its last-used loop auto-applies on load. A
  // full navigation (rather than SPA trickery) is the robust path here.
  const openVideo = (id: string) => {
    if (id === videoId) return;
    window.location.assign(`https://www.youtube.com/watch?v=${id}`);
  };

  const applyLoop = async (id: string) => {
    const loop = savedLoops.find((l) => l.id === id);
    if (loop == null) return;
    selectedLoopId = id;
    state = playbackReducer(state, {
      type: "setLoopSegment",
      segment: loop.main
    });
    zoomLoop =
      loop.zoom != null && state.loopSegment != null
        ? clampLoopToRegion(loop.zoom, state.loopSegment)
        : null;
    if (videoId != null) await setLastUsed(videoId, id);
    // Modal stays open on apply; the row flashes to confirm.
    render();
  };

  const deleteSavedLoop = async (id: string) => {
    if (videoId == null) return;
    await removeLoop(videoId, id);
    savedLoops = savedLoops.filter((l) => l.id !== id);
    if (selectedLoopId === id) selectedLoopId = null;
    render();
  };

  const toggleLoops = () => {
    loopsOpen = !loopsOpen;
    // Refresh the index as the modal opens so the "Saved videos" tab is current.
    if (loopsOpen) void refreshLibrary();
    render();
  };

  const closeLoops = () => {
    if (!loopsOpen) return;
    loopsOpen = false;
    render();
  };

  const render = () => {
    const duration = getVideoDuration(video);
    const selectedLoop = savedLoops.find((l) => l.id === selectedLoopId);
    const loopDirty = isLoopDirty(selectedLoop, state.loopSegment, zoomLoop);
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
          playbackRate={state.playbackRate}
          onToggleEnabled={toggleLoop}
          onToggleMode={toggleMode}
          onToggleZoom={toggleZoom}
          onSpeedDown={() => stepSpeed(-PLAYBACK_RATE_STEP)}
          onSpeedUp={() => stepSpeed(PLAYBACK_RATE_STEP)}
          onResetSpeed={resetSpeed}
          onShowHelp={() => {
            helpOpen = true;
            render();
          }}
          canSaveLoops={state.loopEnabled && videoId != null}
          loopsContainer={
            video.closest(".html5-video-player") as HTMLElement | null
          }
          loopsOpen={loopsOpen}
          savedLoops={savedLoops}
          // A drifted (dirty) selection no longer *is* the saved loop, so no
          // row reads as selected until it's re-applied or saved anew.
          selectedLoopId={loopDirty ? null : selectedLoopId}
          currentSegment={state.loopSegment}
          loopDirty={loopDirty}
          savedVideos={savedVideos}
          currentVideoId={videoId}
          onToggleLoops={toggleLoops}
          onCloseLoops={closeLoops}
          onSaveAsNew={saveAsNew}
          onApplyLoop={applyLoop}
          onDeleteLoop={deleteSavedLoop}
          onOpenVideo={openVideo}
        />
        <HelpModal
          open={helpOpen}
          container={video.closest(".html5-video-player") as HTMLElement | null}
          onClose={() => {
            helpOpen = false;
            render();
          }}
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

  // Keep the panel honest about the live playback rate. YouTube persists its
  // own speed across reloads and writes video.playbackRate directly (native
  // speed menu), so reflect whatever the video reports rather than overriding
  // it. We never write back here — this is display-only sync.
  const onRateChange = () => {
    if (video.playbackRate === state.playbackRate) return;
    state = playbackReducer(state, {
      type: "setPlaybackRate",
      rate: video.playbackRate
    });
    render();
  };

  // Seed from the video's current rate on mount (catches YouTube's restored
  // speed), then track native changes.
  onRateChange();

  // Keyboard shortcuts act on the active region (zoom sub-loop when zoomed,
  // else the main loop) and only while the loop is on. Capture phase so we beat
  // YouTube's own handlers; gating inside the module decides what to intercept.
  const keyHandlers = createLoopKeyHandlers({
    video,
    getSegment: effectiveSegment,
    isActive: () => state.loopEnabled,
    resetOneShot: () => {
      state = playbackReducer(state, {
        type: "markOneShotCompleted",
        completed: false
      });
      render();
    }
  });

  // Seed/restore saved loops once metadata is ready, and re-run on SPA
  // navigation between videos (YouTube reuses the player + <video> element).
  const onLoadedMetadata = () => {
    void loadForVideo();
  };
  const onNavigate = () => {
    const next = currentVideoId();
    if (next === videoId) return;
    videoId = next;
    selectedLoopId = null;
    savedLoops = [];
    loopsOpen = false;
    void loadForVideo();
  };

  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("ratechange", onRateChange);
  video.addEventListener("loadedmetadata", onLoadedMetadata);
  video.addEventListener("durationchange", onLoadedMetadata);
  document.addEventListener("yt-navigate-finish", onNavigate);
  document.addEventListener("keydown", keyHandlers.onKeyDown, true);
  document.addEventListener("keyup", keyHandlers.onKeyUp, true);
  render();
  void loadForVideo();

  return {
    root,
    stop: () => {
      clearZoomCloseTimer();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onLoadedMetadata);
      document.removeEventListener("yt-navigate-finish", onNavigate);
      document.removeEventListener("keydown", keyHandlers.onKeyDown, true);
      document.removeEventListener("keyup", keyHandlers.onKeyUp, true);
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
  style.textContent = PAGE_UI_STYLES;

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

    // Our panel sits at max z-index, but that only competes within the progress
    // bar's own stacking context. In fullscreen, a YouTube sibling otherwise
    // paints over it; lifting the attach point's stacking context floats the
    // whole subtree (panel included) above that sibling.
    timeline.style.zIndex = "2147483647";

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
