import { createRoot, type Root } from "react-dom/client";
import { findYouTubeVideo } from "../../adapters/youtube/adapter";
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
  loadEntry,
  removeLoop,
  renameLoop,
  setLastUsed,
  updateLoop,
  type SavedLoop
} from "../../features/persistence/loopStore";

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

// True once the video reports a real, finite duration (metadata loaded).
function hasKnownDuration(video: HTMLVideoElement): boolean {
  return Number.isFinite(video.duration) && video.duration > 0;
}

// The watch page's video id, or null off a watch page (saving disabled then).
function currentVideoId(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

// Loop positions match within rounding tolerance (segments round to 3 dp).
function segmentsEqual(
  a: LoopSegment | null,
  b: LoopSegment | null
): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a.start - b.start) < 1e-3 && Math.abs(a.end - b.end) < 1e-3;
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
      // Turning the loop off also closes the zoom timeline (no exit animation:
      // the whole control is collapsing).
      clearZoomCloseTimer();
      zoomed = false;
      zoomClosing = false;
      zoomLoop = null;
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

  // Dirty = a saved loop is selected and the live positions differ from it.
  const isLoopsDirty = (): boolean => {
    if (selectedLoopId == null) return false;
    const loop = savedLoops.find((l) => l.id === selectedLoopId);
    if (loop == null) return true;
    return (
      !segmentsEqual(loop.main, state.loopSegment) ||
      !segmentsEqual(loop.zoom, zoomLoop)
    );
  };

  // Seed or restore positions for the current video. Runs on mount and on
  // navigation. Gated on a known duration so percentage seeding is meaningful.
  const loadForVideo = async () => {
    const id = videoId;
    if (!hasKnownDuration(video)) return; // retried on loadedmetadata
    const duration = getVideoDuration(video);

    if (id == null) {
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: defaultLoopSegment(duration)
      });
      savedLoops = [];
      selectedLoopId = null;
      render();
      return;
    }

    const entry = await loadEntry(id);
    if (videoId !== id) return; // navigated away mid-await

    if (entry != null && entry.loops.length > 0) {
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
    } else {
      savedLoops = [];
      selectedLoopId = null;
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: defaultLoopSegment(duration)
      });
      zoomLoop = null;
    }
    render();
  };

  const saveAsNew = async (name: string) => {
    if (videoId == null || state.loopSegment == null) return;
    const loop = await addLoop(videoId, name, state.loopSegment, zoomLoop);
    savedLoops = [...savedLoops, loop];
    selectedLoopId = loop.id;
    loopsOpen = false;
    render();
  };

  const updateSelected = async () => {
    if (videoId == null || selectedLoopId == null || state.loopSegment == null)
      return;
    await updateLoop(videoId, selectedLoopId, state.loopSegment, zoomLoop);
    savedLoops = savedLoops.map((l) =>
      l.id === selectedLoopId
        ? { ...l, main: state.loopSegment!, zoom: zoomLoop }
        : l
    );
    render();
  };

  const replaceLoop = async (id: string) => {
    if (videoId == null || state.loopSegment == null) return;
    await updateLoop(videoId, id, state.loopSegment, zoomLoop);
    savedLoops = savedLoops.map((l) =>
      l.id === id ? { ...l, main: state.loopSegment!, zoom: zoomLoop } : l
    );
    selectedLoopId = id;
    render();
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
    loopsOpen = false;
    render();
  };

  const renameSavedLoop = async (id: string, name: string) => {
    if (videoId == null) return;
    await renameLoop(videoId, id, name);
    savedLoops = savedLoops.map((l) => (l.id === id ? { ...l, name } : l));
    render();
  };

  const deleteSavedLoop = async (id: string) => {
    if (videoId == null) return;
    await removeLoop(videoId, id);
    savedLoops = savedLoops.filter((l) => l.id !== id);
    if (selectedLoopId === id) selectedLoopId = null;
    render();
  };

  const toggleLoopsPopover = () => {
    loopsOpen = !loopsOpen;
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
          loopsOpen={loopsOpen}
          loopsDirty={isLoopsDirty()}
          savedLoops={savedLoops}
          selectedLoopId={selectedLoopId}
          onToggleLoopsPopover={toggleLoopsPopover}
          onSaveAsNew={saveAsNew}
          onUpdateSelected={updateSelected}
          onApplyLoop={applyLoop}
          onReplaceLoop={replaceLoop}
          onRenameLoop={renameSavedLoop}
          onDeleteLoop={deleteSavedLoop}
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

    .you-loop-mode-option:not(:disabled):not([data-active="true"]):hover {
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

    /* Speed stepper: a compact recessed pill —  ‹ 1× ›  (independent of loop). */
    .you-loop-speed {
      align-items: center;
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 0;
      padding: 2px;
      transition: opacity 0.18s ease;
    }

    .you-loop-speed[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-speed-step {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 27px;
      justify-content: center;
      padding: 0;
      transition: color 0.15s ease;
      width: 20px;
    }

    .you-loop-speed-step svg {
      height: 13px;
      width: 13px;
    }

    .you-loop-speed-step:not(:disabled):hover {
      color: #5eead4;
    }

    .you-loop-speed-step:disabled {
      cursor: default;
      opacity: 0.3;
    }

    .you-loop-speed-value {
      background: transparent;
      border: 0;
      color: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      display: grid;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: 0.01em;
      min-width: 30px;
      padding: 0;
      place-items: center;
      text-align: center;
      transition: color 0.15s ease;
    }

    /* Number and reset glyph occupy the same cell so swapping them on hover
       never shifts the panel's width. */
    .you-loop-speed-num,
    .you-loop-speed-reset {
      grid-area: 1 / 1;
      transition: opacity 0.12s ease;
    }

    .you-loop-speed-reset {
      display: inline-flex;
      opacity: 0;
    }

    .you-loop-speed-reset svg {
      height: 14px;
      width: 14px;
    }

    .you-loop-speed-value:not(:disabled):hover {
      color: #ffffff;
    }

    .you-loop-speed-value:disabled {
      cursor: default;
    }

    /* The × sits a touch larger than the number. */
    .you-loop-speed-x {
      font-size: 13px;
      margin-left: 0.5px;
    }

    .you-loop-speed-value[data-modified="true"] {
      color: #5eead4;
    }

    /* Once the rate is off 1×, hovering the value reveals the reset glyph so
       the click-to-reset affordance is discoverable exactly when it matters. */
    .you-loop-speed-value[data-modified="true"]:not(:disabled):hover .you-loop-speed-num {
      opacity: 0;
    }

    .you-loop-speed-value[data-modified="true"]:not(:disabled):hover .you-loop-speed-reset {
      opacity: 1;
    }

    /* Snap-back pulse confirms the reset click landed. */
    .you-loop-speed-value[data-pulse="true"] {
      animation: you-loop-speed-pulse 0.32s ease;
    }

    @keyframes you-loop-speed-pulse {
      0% {
        transform: scale(1);
      }
      35% {
        transform: scale(1.28);
      }
      100% {
        transform: scale(1);
      }
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

    /* A filled teal knob, like YouTube's scrubber dot. */
    .you-loop-zoom-playhead {
      background: #2dd4bf;
      border-radius: 50%;
      height: 20px;
      left: 0;
      pointer-events: none;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      transition: opacity 0.15s ease;
      width: 20px;
      will-change: left;
      /* Sit behind the loop cursors so the larger playhead does not obscure them. */
      z-index: 1;
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

    /* ---- Help: info toggle + docs modal ---- */
    .you-loop-help-toggle {
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

    .you-loop-help-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-help-toggle:hover {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    .you-loop-help-backdrop {
      align-items: center;
      animation: you-loop-help-fade 0.18s ease both;
      background: rgba(0, 0, 0, 0.5);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 24px;
      pointer-events: auto;
      position: absolute;
      z-index: 2147483647;
    }

    @keyframes you-loop-help-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .you-loop-help-backdrop[data-closing="true"] {
      animation: you-loop-help-fade-out 0.18s ease both;
    }

    @keyframes you-loop-help-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .you-loop-help-card {
      animation: you-loop-help-rise 0.24s cubic-bezier(0.16, 1, 0.3, 1) both;
      background: rgba(28, 28, 32, 0.82);
      -webkit-backdrop-filter: blur(18px) saturate(1.2);
      backdrop-filter: blur(18px) saturate(1.2);
      border: 1px solid rgba(0, 0, 0, 0.6);
      border-radius: 16px;
      box-shadow:
        0 0 0 1px rgba(20, 184, 166, 0.16),
        0 24px 70px rgba(0, 0, 0, 0.6),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      box-sizing: border-box;
      color: rgba(255, 255, 255, 0.78);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      max-height: calc(100% - 48px);
      max-width: 440px;
      overflow-y: auto;
      padding: 26px 28px 22px;
      position: relative;
      width: 100%;
    }

    @keyframes you-loop-help-rise {
      from { opacity: 0; transform: translateY(10px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .you-loop-help-card[data-closing="true"] {
      animation: you-loop-help-sink 0.2s cubic-bezier(0.4, 0, 1, 1) both;
    }

    @keyframes you-loop-help-sink {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(8px) scale(0.97); }
    }

    .you-loop-help-close {
      align-items: center;
      background: rgba(255, 255, 255, 0.06);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      padding: 0;
      position: absolute;
      right: 16px;
      top: 16px;
      transition: color 0.18s ease, background 0.18s ease;
      width: 28px;
    }

    .you-loop-help-close svg {
      height: 15px;
      width: 15px;
    }

    .you-loop-help-close:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    /* The wordmark is the header hero. */
    .you-loop-help-eyebrow {
      color: #5eead4;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    /* Tagline sits beneath the wordmark as a lighter supporting line. */
    .you-loop-help-title {
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
      margin: 6px 36px 0 0;
    }

    .you-loop-help-intro {
      color: rgba(255, 255, 255, 0.62);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 8px 0 0;
    }

    .you-loop-help-section {
      margin-top: 20px;
    }

    .you-loop-help-label {
      color: #14b8a6;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.16em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }

    .you-loop-help-note {
      color: rgba(255, 255, 255, 0.4);
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: none;
    }

    .you-loop-help-list {
      display: flex;
      flex-direction: column;
      gap: 11px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .you-loop-help-row {
      align-items: start;
      display: grid;
      gap: 6px 14px;
      grid-template-columns: 96px 1fr;
    }

    /* Panel rows lead with the control's own glyph in a narrow column. */
    .you-loop-help-row--panel {
      align-items: start;
      grid-template-columns: 30px 1fr;
    }

    .you-loop-help-ico {
      align-items: center;
      color: #5eead4;
      display: inline-flex;
      height: 17px;
      justify-content: center;
    }

    .you-loop-help-ico svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-help-ico-pair {
      align-items: center;
      color: #5eead4;
      display: inline-flex;
      gap: 1px;
    }

    .you-loop-help-ico-pair svg {
      height: 12px;
      width: 12px;
    }

    .you-loop-help-term {
      color: rgba(255, 255, 255, 0.92);
      font-size: 12.5px;
      font-weight: 600;
    }

    .you-loop-help-desc {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12.5px;
      line-height: 1.45;
    }

    .you-loop-help-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .you-loop-help-keys {
      align-items: center;
      display: flex;
      gap: 7px;
    }

    .you-loop-kbd {
      background: rgba(0, 0, 0, 0.34);
      border-radius: 6px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      color: #5eead4;
      display: inline-flex;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      justify-content: center;
      min-width: 24px;
      padding: 4px 7px;
    }

    .you-loop-help-hold {
      color: rgba(255, 255, 255, 0.4);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .you-loop-help-foot {
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.38);
      font-size: 11px;
      margin: 20px 0 0;
      padding-top: 12px;
    }

    .you-loop-help-memory {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 0;
    }

    .you-loop-loops {
      position: relative;
    }

    .you-loop-loops-toggle {
      align-items: center;
      background: transparent;
      border: 0;
      color: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      display: inline-flex;
      height: 24px;
      justify-content: center;
      padding: 0;
      width: 24px;
    }

    .you-loop-loops-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-loops-toggle:not(:disabled):hover {
      color: #ffffff;
    }

    .you-loop-loops-toggle:disabled {
      cursor: default;
      opacity: 0.4;
    }

    /* Unsaved-changes dot on the toggle. */
    .you-loop-loops-toggle[data-dirty="true"]::after {
      background: #5eead4;
      border-radius: 50%;
      content: "";
      height: 5px;
      position: absolute;
      right: 1px;
      top: 1px;
      width: 5px;
    }

    .you-loop-loops-popover {
      background: rgba(18, 18, 18, 0.97);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      bottom: calc(100% + 10px);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
      color: #fff;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      pointer-events: auto;
      position: absolute;
      right: 0;
      width: 240px;
      z-index: 2;
    }

    .you-loop-loops-new {
      display: flex;
      gap: 6px;
    }

    .you-loop-loops-input {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      color: #fff;
      flex: 1;
      font-size: 12px;
      min-width: 0;
      padding: 5px 7px;
    }

    .you-loop-loops-save,
    .you-loop-loops-update {
      background: rgba(94, 234, 212, 0.16);
      border: 0;
      border-radius: 6px;
      color: #5eead4;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 8px;
      white-space: nowrap;
    }

    .you-loop-loops-save:disabled {
      cursor: default;
      opacity: 0.45;
    }

    .you-loop-loops-update {
      text-align: left;
    }

    .you-loop-loops-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      list-style: none;
      margin: 0;
      max-height: 200px;
      overflow-y: auto;
      padding: 0;
    }

    .you-loop-loops-empty {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      padding: 4px 2px;
    }

    .you-loop-loops-row {
      align-items: center;
      border-radius: 6px;
      display: flex;
      gap: 6px;
      padding: 2px 4px;
    }

    .you-loop-loops-row[data-selected="true"] {
      background: rgba(255, 255, 255, 0.08);
    }

    .you-loop-loops-name {
      align-items: center;
      background: transparent;
      border: 0;
      color: #fff;
      cursor: pointer;
      display: flex;
      flex: 1;
      font-size: 12.5px;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
      padding: 3px 2px;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .you-loop-loops-dirty {
      background: #5eead4;
      border-radius: 50%;
      flex: none;
      height: 5px;
      width: 5px;
    }

    .you-loop-loops-actions {
      display: inline-flex;
      gap: 2px;
    }

    .you-loop-loops-actions button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      padding: 4px 5px;
    }

    .you-loop-loops-actions button:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
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
