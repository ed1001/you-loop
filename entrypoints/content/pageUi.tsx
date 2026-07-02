import { createRoot, type Root } from "react-dom/client";
import { findYouTubeVideo, getVideoTitle } from "../../adapters/youtube/adapter";
import {
  createInitialPlaybackState,
  defaultLoopSegment,
  playbackReducer
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
import { translateSegment } from "../../features/playback/translateSegment";
import { HelpModal } from "../../features/player-overlay/HelpModal";
import {
  addLoop,
  loadEntry,
  removeLoop,
  setLastUsed,
  updateLoop,
  type SavedLoop,
  type VideoEntry
} from "../../features/persistence/loopStore";
import {
  getLoopOn,
  setLoopOn,
  takeLaunch
} from "../../features/persistence/settingsStore";
import {
  getCountInEnabled,
  setCountInEnabled,
  loadCountInSettings,
  saveCountInSettings,
  sanitizeCountInSettings,
  DEFAULT_COUNT_IN_SETTINGS,
  type CountInSettings
} from "../../features/persistence/countInStore";
import { createPitchGraph } from "../../features/pitch/pitchGraph";
import {
  DEFAULT_PITCH_SETTINGS,
  loadPitchSettings,
  savePitchSettings,
  type PitchSettings
} from "../../features/persistence/pitchStore";
import { buildCountOff } from "../../features/playback/countOff";
import { createCountInPlayer } from "../../features/player-overlay/countInAudio";
import { createCountInController } from "../../features/player-overlay/countInController";
import { PAGE_UI_STYLES } from "./pageUi.styles";

// Player-width thresholds for the compact panel form, with a dead band so a
// pill sitting right at the edge does not oscillate between forms.
const COMPACT_ENTER_PX = 735;
const COMPACT_EXIT_PX = 755;

// Pure width→compact decision. `prev` is the current compact flag; the band
// between ENTER and EXIT holds whatever state we are already in.
export function nextCompactState(width: number, prev: boolean): boolean {
  if (prev) return width < COMPACT_EXIT_PX; // stay compact until clearly wide
  return width < COMPACT_ENTER_PX; // go compact once clearly narrow
}

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

// Two count-in settings are equal when every field matches.
function countInEqual(a: CountInSettings, b: CountInSettings): boolean {
  return (
    a.bpm === b.bpm &&
    a.beatsPerBar === b.beatsPerBar &&
    a.noteValue === b.noteValue &&
    a.bars === b.bars
  );
}

// The save button is live only when the current selection differs from the
// saved loop it came from: no source loop means a fresh, savable selection; an
// exact match (main, zoom, and — for loops that carry a tempo snapshot —
// count-in) means there's nothing new to save. Legacy loops (no snapshot)
// never go tempo-dirty: there's nothing to compare against.
function isLoopDirty(
  source: SavedLoop | undefined,
  segment: LoopSegment | null,
  zoom: LoopSegment | null,
  countIn: CountInSettings
): boolean {
  if (segment == null) return false;
  if (source == null) return true;
  if (!segmentsEqual(source.main, segment) || !segmentsEqual(source.zoom, zoom)) {
    return true;
  }
  return source.countIn != null && !countInEqual(source.countIn, countIn);
}

// The store-level patch for a pencil-edit commit: the name field only when
// provided, and the replace-with-current fields (main/zoom/count-in,
// snapshotted from live state) only when replacing. `loopSegment` is only
// read when `patch.replaceState` is set, at which point the caller has
// already verified it is non-null.
function buildEditStorePatch(
  patch: { name?: string; replaceState?: boolean },
  loopSegment: LoopSegment | null,
  zoom: LoopSegment | null,
  countIn: CountInSettings
): Partial<Pick<SavedLoop, "name" | "main" | "zoom" | "countIn">> {
  const store: Partial<Pick<SavedLoop, "name" | "main" | "zoom" | "countIn">> = {};
  if (patch.name != null) store.name = patch.name;
  if (patch.replaceState) {
    store.main = loopSegment!;
    store.zoom = zoom;
    store.countIn = countIn;
  }
  return store;
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
  // The video whose loop state has been seeded. Gates loadForVideo so repeat
  // durationchange events on the same video don't wipe the user's loop.
  let seededVideoId: string | null = null;
  // Set by stop(): async loaders must not touch the graph or render after
  // teardown (the React root is unmounted).
  let stopped = false;
  let savedLoops: SavedLoop[] = [];
  let selectedLoopId: string | null = null;
  let loopsOpen = false;
  // Count-in state: global on/off and per-video tempo/meter settings.
  let countInOn = false;
  let countInSettings: CountInSettings = DEFAULT_COUNT_IN_SETTINGS;
  // Live count-off beat for the on-bar beacon: the current beat index while a
  // count runs, null otherwise. `countInSession` bumps per count so a restarted
  // count re-keys the beacon and replays the beat-0 pulse.
  let countInBeat: number | null = null;
  let countInSession = 0;

  // Pitch shift: independent of the loop. The graph taps the element lazily on
  // the first non-zero offset; settings persist per video, and 0 is
  // bit-transparent (direct branch), so there is no separate on/off.
  let pitchSettings: PitchSettings = DEFAULT_PITCH_SETTINGS;
  const pitchGraph = createPitchGraph(video);
  let pitchAvailable = pitchGraph.isAvailable();

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
    // Prime the start: snap the playhead into the region now so YouTube begins
    // buffering `start` the moment the loop turns on, not on the first wrap.
    // The rAF driver only runs while playing, so without this a narrow loop
    // enabled while paused waits until play to seek, then stalls on the first
    // restart. enforce() only seeks when the playhead is outside the region, so
    // the whole-timeline default (playhead already inside) is a no-op — no rewind.
    enforce();
  };

  const clearZoomCloseTimer = () => {
    if (zoomCloseTimer !== 0) {
      window.clearTimeout(zoomCloseTimer);
      zoomCloseTimer = 0;
    }
  };

  // Turn the loop off. Hides the zoom timeline (render gates it on loopEnabled)
  // but keeps `zoomed`/`zoomLoop` so the zoom sub-region resumes when the loop
  // is turned back on. Speed control is tied to the loop being on, so this also
  // snaps playback back to 1× and hands rate control back to YouTube.
  const disableLoop = () => {
    clearZoomCloseTimer();
    zoomClosing = false;
    countInController.cancel();
    state = playbackReducer(state, { type: "setLoopEnabled", enabled: false });
    state = playbackReducer(state, { type: "resetPlaybackRate" });
    applyPlaybackState(video, state);
  };

  const toggleLoop = () => {
    if (state.loopEnabled) {
      disableLoop();
    } else {
      enableLoop();
    }
    // Persist the panel's on/off so it sticks across reloads, tabs, and videos.
    void setLoopOn(state.loopEnabled);
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

  // Move the active loop window by `delta` seconds, length preserved. While
  // magnified it slides the zoom sub-region inside the main loop; otherwise it
  // slides the main loop within the timeline (which re-clamps the zoom
  // sub-region, via onMainLoopChange). Seeks the playhead to the new window
  // start when the start actually changes (boundary no-ops do not seek).
  const moveActiveWindow = (delta: number) => {
    if (zoomed && zoomLoop != null && state.loopSegment != null) {
      const preMoveStart = zoomLoop.start;
      const moved = translateSegment(zoomLoop, delta, {
        min: state.loopSegment.start,
        max: state.loopSegment.end
      });
      onZoomLoopChange(moved);
      if (moved.start !== preMoveStart) {
        video.currentTime = moved.start;
      }
      return;
    }
    if (state.loopSegment == null) return;
    const preMoveStart = state.loopSegment.start;
    const moved = translateSegment(state.loopSegment, delta, {
      min: 0,
      max: getVideoDuration(video)
    });
    onMainLoopChange(moved);
    if (moved.start !== preMoveStart) {
      video.currentTime = moved.start;
    }
  };

  // Speed control: independent of the loop. Apply the rate straight to the
  // video so the scrub is audible live, step by step.
  const setSpeed = (rate: number) => {
    state = playbackReducer(state, { type: "setPlaybackRate", rate });
    applyPlaybackState(video, state);
    render();
  };

  const resetSpeed = () => {
    state = playbackReducer(state, { type: "resetPlaybackRate" });
    applyPlaybackState(video, state);
    render();
  };

  // Push current pitch state into the graph and reflect availability.
  const applyPitch = () => {
    pitchGraph.setSettings(pitchSettings);
    pitchAvailable = pitchGraph.isAvailable();
  };

  const setPitch = (next: PitchSettings) => {
    pitchSettings = next;
    applyPitch();
    if (videoId != null) void savePitchSettings(videoId, pitchSettings);
    render();
  };

  const resetPitch = () => {
    pitchSettings = DEFAULT_PITCH_SETTINGS;
    applyPitch();
    if (videoId != null) void savePitchSettings(videoId, pitchSettings);
    render();
  };

  // Load the per-video pitch, then apply. Same async race guard as
  // loadForVideo (videoId can change mid-await on SPA navigation), plus a
  // stop guard: the storage await can resolve after teardown, and rendering
  // an unmounted root throws.
  const loadPitchForVideo = async () => {
    const id = videoId;
    const s = id != null ? await loadPitchSettings(id) : DEFAULT_PITCH_SETTINGS;
    if (stopped || videoId !== id) return;
    pitchSettings = s;
    applyPitch();
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

  // Restore a saved loop's tempo snapshot into the live count-in settings and
  // persist it as this video's count-in default. Legacy loops (no snapshot,
  // countIn null/absent) leave the current settings untouched — there's
  // nothing to restore.
  const restoreLoopCountIn = (loop: SavedLoop) => {
    if (loop.countIn == null) return;
    countInSettings = sanitizeCountInSettings(loop.countIn);
    if (videoId != null) void saveCountInSettings(videoId, countInSettings);
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
    restoreLoopCountIn(loop);
  };

  // Set the panel's on/off for the freshly loaded video. A popup launch loads
  // the last-used loop and forces the panel on (persisting it so the on state
  // carries through the session); otherwise the persisted global preference
  // wins. Turning on is non-intrusive — the default whole-timeline loop never
  // seeks — so no saved loop is auto-applied here.
  const applyPanelActivation = (
    launched: boolean,
    entry: VideoEntry | null,
    persistedOn: boolean
  ) => {
    if (launched && entry != null && entry.loops.length > 0) {
      applySavedEntry(entry);
      enableLoop();
      void setLoopOn(true);
    } else if (persistedOn) {
      enableLoop();
    } else if (state.loopEnabled) {
      // Carried-on in-memory state contradicts a persisted-off preference
      // (e.g. toggled off elsewhere): honour the preference and switch off.
      disableLoop();
    }
  };

  // Seed or restore positions for the current video. Runs on mount and on
  // navigation. Gated on a known duration so percentage seeding is meaningful.
  // fallow-ignore-next-line complexity
  const loadForVideo = async () => {
    const id = videoId;
    if (!hasKnownDuration(video)) return; // retried on loadedmetadata
    // durationchange re-fires on the same video mid-session — a mid-roll ad
    // swapping the source in, a live stream growing, a quality flip. Reseeding
    // then would silently wipe the loop the user has set up. Only the first
    // successful load for a video seeds state; navigation clears the segment
    // (clearLoop) so the next video passes this gate again.
    if (seededVideoId === id && state.loopSegment != null) return;
    const duration = getVideoDuration(video);

    if (id == null) {
      seedDefaultLoop(duration);
      seededVideoId = id;
      render();
      return;
    }

    const entry = await loadEntry(id, undefined, getVideoTitle() ?? undefined);
    if (videoId !== id) return; // navigated away mid-await

    // Arrived via the popup's saved-videos list: the user picked this video to
    // practice, so the loop panel starts enabled instead of the default off.
    const launched = await takeLaunch(id);
    if (videoId !== id) return;

    // Seed the editable region to the default. A specific saved loop is applied
    // only by an explicit action (picking it in the modal, or a popup launch
    // below) — never silently on load — so navigation never yanks the playhead
    // into a region the user didn't just choose.
    seedDefaultLoop(duration);
    if (entry != null && entry.loops.length > 0) {
      // Expose the saved loops to the modal without selecting/applying one.
      savedLoops = entry.loops;
    }

    // The panel's on/off is a persisted global preference, so it sticks across
    // reloads, tabs, and navigation.
    const persistedOn = await getLoopOn();
    if (videoId !== id) return; // navigated away mid-await

    countInOn = await getCountInEnabled();
    countInSettings = await loadCountInSettings(id);
    if (videoId !== id) return; // navigated away mid-await

    applyPanelActivation(launched, entry, persistedOn);
    seededVideoId = id;
    render();
  };

  const saveAsNew = async (name: string) => {
    if (videoId == null || state.loopSegment == null) return;
    const loop = await addLoop(
      videoId,
      name,
      state.loopSegment,
      zoomLoop,
      countInSettings
    );
    savedLoops = [...savedLoops, loop];
    selectedLoopId = loop.id;
    // Persist the title now so this video shows a name in the index without
    // waiting for a later revisit to backfill it.
    await loadEntry(videoId, undefined, getVideoTitle() ?? undefined);
    // Stay open so the new loop appears in the list as confirmation.
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
    restoreLoopCountIn(loop);
    if (videoId != null) await setLastUsed(videoId, id);
    // Modal stays open on apply; the row flashes to confirm.
    render();
  };

  // Refresh `savedLoops` from storage when an edited loop has vanished from it
  // (deleted elsewhere), clearing the selection if it pointed at that loop.
  const refreshMissingLoop = async (id: string, forVideoId: string) => {
    const entry = await loadEntry(forVideoId, undefined, getVideoTitle() ?? undefined);
    savedLoops = entry?.loops ?? [];
    if (selectedLoopId === id) selectedLoopId = null;
  };

  // Apply a pencil-edit commit to a saved loop: a rename, a replace-with-
  // current (main/zoom/count-in overwritten from live state), or both. The id
  // comes from whichever row's pencil was open, not from selection state, so
  // this can edit a loop other than the one that's currently applied. A
  // replace makes the edited loop the new selection (it now matches current
  // state, so its row reads selected/clean); a rename alone must not steal
  // the selection from whatever row already holds it.
  const editSavedLoop = async (
    id: string,
    patch: { name?: string; replaceState?: boolean }
  ): Promise<void> => {
    if (videoId == null) return;
    if (patch.replaceState && state.loopSegment == null) return;
    const storePatch = buildEditStorePatch(patch, state.loopSegment, zoomLoop, countInSettings);
    if (Object.keys(storePatch).length === 0) return;

    const updated = await updateLoop(videoId, id, storePatch);
    if (updated == null) {
      await refreshMissingLoop(id, videoId);
    } else {
      savedLoops = savedLoops.map((l) => (l.id === updated.id ? updated : l));
      if (patch.replaceState) selectedLoopId = id;
    }
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
    render();
  };

  const closeLoops = () => {
    if (!loopsOpen) return;
    loopsOpen = false;
    render();
  };

  const onToggleCountIn = () => {
    countInOn = !countInOn;
    countInPlayer.unlock(); // user gesture: satisfy autoplay policy
    void setCountInEnabled(countInOn);
    if (!countInOn) countInController.cancel();
    render();
  };

  const onCountInSettingsChange = (next: CountInSettings) => {
    countInSettings = next;
    countInPlayer.unlock();
    if (videoId != null) void saveCountInSettings(videoId, next);
    render();
  };

  // The zoom strip shows while zoomed (or animating closed) and a real loop
  // exists to refine. Hoisted out of render() so that stays a simple dispatch.
  const zoomStripVisible = () =>
    (zoomed || zoomClosing) &&
    state.loopEnabled &&
    state.loopSegment != null &&
    zoomLoop != null;

  const render = () => {
    const duration = getVideoDuration(video);
    const selectedLoop = savedLoops.find((l) => l.id === selectedLoopId);
    const loopDirty = isLoopDirty(
      selectedLoop,
      state.loopSegment,
      zoomLoop,
      countInSettings
    );
    const zoomVisible = zoomStripVisible();
    // Beacon at the point playback will resume from — the zoom sub-region
    // start while magnified, else the main loop start. Rendered by the zoom
    // strip while it is up, otherwise by the main-bar handles.
    const countIn =
      countInBeat != null && effectiveSegment() != null
        ? {
            timeSec: effectiveSegment()!.start,
            beatIndex: countInBeat,
            beatsPerBar: countInSettings.beatsPerBar,
            session: countInSession
          }
        : null;

    root.render(
      <>
        {zoomVisible && (
          <ZoomTimeline
            video={video}
            window={state.loopSegment!}
            loop={zoomLoop!}
            onLoopChange={onZoomLoopChange}
            onWindowMove={(loop) => {
              onZoomLoopChange(loop);
              video.currentTime = loop.start;
            }}
            closing={zoomClosing}
            countIn={countIn}
          />
        )}
        {state.loopEnabled && (
          <TimelineHandles
            duration={duration}
            segment={state.loopSegment}
            onSegmentChange={onMainLoopChange}
            onWindowMove={(seg) => {
              onMainLoopChange(seg);
              video.currentTime = seg.start;
            }}
            countIn={zoomVisible ? null : countIn}
          />
        )}
        <LoopPanel
          enabled={state.loopEnabled}
          mode={state.playMode}
          zoomed={zoomed && zoomVisible}
          playbackRate={state.playbackRate}
          onToggleEnabled={toggleLoop}
          onToggleMode={toggleMode}
          onToggleZoom={toggleZoom}
          onSpeedChange={setSpeed}
          onResetSpeed={resetSpeed}
          pitchSettings={pitchSettings}
          pitchAvailable={pitchAvailable}
          onPitchChange={setPitch}
          onResetPitch={resetPitch}
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
          duration={duration}
          onToggleLoops={toggleLoops}
          onCloseLoops={closeLoops}
          onSaveAsNew={saveAsNew}
          onEditLoop={(id, patch) => void editSavedLoop(id, patch)}
          onApplyLoop={applyLoop}
          onDeleteLoop={deleteSavedLoop}
          countInOn={countInOn}
          countInSettings={countInSettings}
          onToggleCountIn={onToggleCountIn}
          onCountInSettingsChange={onCountInSettingsChange}
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
  //
  // Latch a wrap seek until it settles. `video.seeking` alone is not enough: a
  // wrap into an unbuffered point can clear `seeking` with the playhead still
  // past `end` (the fetch hasn't landed), so the next rAF tick wraps again, and
  // again — dozens of stacked seeks per second that spiral the player into a
  // multi-second freeze (worst on tight zoom loops, which wrap constantly). Once
  // we issue a wrap, hold off all enforcement until `seeked` fires (the seek
  // truly landed) or a fail-safe timeout elapses, so YouTube's buffer can settle
  // and we contribute at most one seek per wrap.
  const WRAP_SETTLE_TIMEOUT_MS = 1000;
  let wrapSeekPending = false;
  let wrapSeekAt = 0;
  const onSeeked = () => {
    wrapSeekPending = false;
  };

  // Skip while a seek is in flight: setting `currentTime` is async, so on the
  // next tick `currentTime` may still read the pre-seek value; acting on it
  // would stack a second seek onto the first and make YouTube re-buffer (the
  // loading spinner that used to flash on loop restart).
  const enforce = () => {
    if (video.seeking) return;
    // An ad plays through the same <video> element. Enforcing the loop then
    // would wrap the ad inside the user's segment (or seek the ad around);
    // stand down until the player drops its ad flag.
    if (video.closest(".html5-video-player")?.classList.contains("ad-showing")) {
      return;
    }
    if (wrapSeekPending) {
      if (performance.now() - wrapSeekAt < WRAP_SETTLE_TIMEOUT_MS) return;
      // Fail-safe: `seeked` never arrived (rare); release so looping resumes.
      wrapSeekPending = false;
    }
    const result = enforceSegmentEnd(video, {
      ...state,
      loopSegment: effectiveSegment()
    });
    if (result.sought) {
      wrapSeekPending = true;
      wrapSeekAt = performance.now();
    }
    if (result.wrapped) {
      countInController.onWrap();
    }
    if (result.oneShotCompleted !== state.oneShotCompleted) {
      state = playbackReducer(state, {
        type: "markOneShotCompleted",
        completed: result.oneShotCompleted
      });
    }
  };

  // `timeupdate` only fires ~4x/sec, so on its own the playhead can sail up to
  // ~250ms past the segment end before wrapping — at 3x speed that's most of a
  // short loop, and it lets the playhead cross the end cursor before snapping
  // back (jerky, imprecise looping). Drive enforcement off requestAnimationFrame
  // (~60Hz) while playing so the wrap is tight and consistent. `timeupdate`
  // stays wired below as a backstop for when rAF is throttled (background tab).
  let enforceRaf = 0;
  const enforceFrame = () => {
    enforce();
    enforceRaf = requestAnimationFrame(enforceFrame);
  };
  const startEnforce = () => {
    if (enforceRaf === 0) enforceRaf = requestAnimationFrame(enforceFrame);
  };
  const stopEnforce = () => {
    if (enforceRaf !== 0) {
      cancelAnimationFrame(enforceRaf);
      enforceRaf = 0;
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
    moveActiveWindow,
    resetOneShot: () => {
      state = playbackReducer(state, {
        type: "markOneShotCompleted",
        completed: false
      });
      render();
    },
    // Restart (A) counts you in too when count-in is on. Declared below; only
    // invoked on a keypress, so it is initialized by call time.
    startCountIn: () => {
      const started = countInController.start();
      if (started) {
        // The Restart key just seeked to the region start. That seek is ours,
        // not a user scrub — latch it (same flag the wrap seek uses) so the
        // `seeking` listener doesn't cancel the count we just began.
        wrapSeekPending = true;
        wrapSeekAt = performance.now();
      }
      return started;
    }
  });

  const countInPlayer = createCountInPlayer();
  const countInController = createCountInController({
    video,
    player: countInPlayer,
    isEnabled: () => countInOn && state.loopEnabled,
    getPlan: () =>
      buildCountOff({
        meter: {
          beatsPerBar: countInSettings.beatsPerBar,
          noteValue: countInSettings.noteValue
        },
        bars: countInSettings.bars,
        bpm: countInSettings.bpm
      }),
    onCountStart: () => {
      countInSession++;
    },
    onBeat: (index) => {
      countInBeat = index;
      render();
    },
    onCountEnd: () => {
      countInBeat = null;
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
    // Clear the previous video's loop segment before the async reload so the
    // rAF/timeupdate enforcer can't snap the playhead to that stale region in
    // the gap before loadForVideo() resolves (enforceSegmentEnd no-ops while
    // loopSegment is null). The on/off state is intentionally preserved: an
    // active panel stays active into the next video (restoring its loops if it
    // has any), an inactive one stays off.
    clearZoomCloseTimer();
    zoomLoop = null;
    zoomed = false;
    zoomClosing = false;
    countInController.cancel();
    state = playbackReducer(state, { type: "clearLoop" });
    render();
    void loadForVideo();
    void loadPitchForVideo();
  };

  // Cancel a running count when the USER seeks (scrubs) during the count.
  // Guard on !wrapSeekPending: the controller's own wrap seek sets
  // wrapSeekPending synchronously in enforce() before the queued `seeking`
  // event fires, so we only cancel on genuine user scrubs.
  const onSeeking = () => {
    if (countInController.isCounting() && !wrapSeekPending) countInController.cancel();
  };

  // The video must not play while a count runs. Any play attempt mid-count
  // (Space/K, the player button, a scrub side effect) is treated as a pause
  // intent — the play/pause control behaves as though the video were already
  // playing: it stops the count and stays paused. The controller's own
  // downbeat resume clears `counting` before calling play(), so it passes.
  const onPlay = () => {
    if (countInController.isCounting()) {
      video.pause();
      countInController.cancel();
    }
  };

  video.addEventListener("timeupdate", enforce);
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("play", startEnforce);
  video.addEventListener("playing", startEnforce);
  video.addEventListener("pause", stopEnforce);
  video.addEventListener("ended", stopEnforce);
  video.addEventListener("ratechange", onRateChange);
  video.addEventListener("loadedmetadata", onLoadedMetadata);
  video.addEventListener("durationchange", onLoadedMetadata);
  video.addEventListener("seeking", onSeeking);
  video.addEventListener("play", onPlay);
  document.addEventListener("yt-navigate-finish", onNavigate);
  document.addEventListener("keydown", keyHandlers.onKeyDown, true);
  document.addEventListener("keyup", keyHandlers.onKeyUp, true);
  if (!video.paused) startEnforce();
  render();
  void loadForVideo();
  void loadPitchForVideo();

  return {
    root,
    stop: () => {
      stopped = true;
      clearZoomCloseTimer();
      stopEnforce();
      countInController.cancel();
      countInPlayer.dispose();
      video.removeEventListener("timeupdate", enforce);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("play", startEnforce);
      video.removeEventListener("playing", startEnforce);
      video.removeEventListener("pause", stopEnforce);
      video.removeEventListener("ended", stopEnforce);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onLoadedMetadata);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("play", onPlay);
      document.removeEventListener("yt-navigate-finish", onNavigate);
      document.removeEventListener("keydown", keyHandlers.onKeyDown, true);
      document.removeEventListener("keyup", keyHandlers.onKeyUp, true);
      pitchGraph.dispose();
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
  // The @font-face must live in the document (not a shadow root) for the
  // wordmark font to load; the URL is only known at runtime. In tests there
  // is no extension runtime — the bare path keeps jsdom happy.
  const wordmarkFontUrl =
    typeof browser === "undefined"
      ? "/fonts/fraunces-italic.woff2"
      : browser.runtime.getURL("/fonts/fraunces-italic.woff2");
  style.textContent = `
    @font-face {
      font-family: "Étude Fraunces";
      font-style: italic;
      font-weight: 500;
      src: url("${wordmarkFontUrl}") format("woff2");
    }
  ${PAGE_UI_STYLES}`;

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

// Drive the compact panel form from the player's content width. The page-ui
// element has `inset: 0`, so its width tracks the player. Writes
// `panel.dataset.compact` only when the form flips, so resize bursts don't
// churn the DOM. CSS keys the compact styles off this attribute.
export function watchPlayerWidth(panel: HTMLElement) {
  let compact = false;

  const sync = () => {
    const next = nextCompactState(panel.clientWidth, compact);
    if (next === compact && panel.dataset.compact != null) return;
    compact = next;
    panel.dataset.compact = next ? "true" : "false";
  };

  sync();

  if (typeof ResizeObserver === "undefined") {
    return () => {};
  }

  const observer = new ResizeObserver(sync);
  observer.observe(panel);

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
  const stopWidth = watchPlayerWidth(panel);
  const { root, stop } = renderTimelineCursors(panel, video);

  mountedPageUis.set(panel, {
    root,
    stop,
    cleanup: () => {
      stopTimeline();
      stopAutohide();
      stopWidth();
      // Leave the attach point stock: we only ever set these inline (the
      // stylesheet values, if any, come back when the inline overrides go).
      const timeline = panel.parentElement;
      if (timeline instanceof HTMLElement) {
        timeline.style.position = "";
        timeline.style.zIndex = "";
      }
    }
  });

  return panel;
}

// Attempt the mount; returns true once the panel exists. Both deps (the
// <video> and the `.ytp-progress-bar`) can lag behind `.html5-video-player`
// on a cold load, so a false result means "not yet" — the caller rearms.
function tryMountPageUi(): boolean {
  if (document.querySelector(PAGE_UI_SELECTOR) != null) {
    return true;
  }

  const video = findYouTubeVideo();
  if (video == null) {
    return false;
  }

  const timeline = findYouTubeTimeline(video);
  if (timeline == null) {
    return false;
  }

  timeline.append(createPageUiElement(video));
  return true;
}

// One-shot retry: when the mount deps aren't ready yet, watch the DOM and try
// again as each node lands. Without this the panel silently never appears on a
// slow load and only a manual refresh brings it back. A single live observer
// at a time; a `setPageUiVisible(false)` cancels it.
let pendingMount: MutationObserver | null = null;

function cancelPendingMount() {
  pendingMount?.disconnect();
  pendingMount = null;
}

function armPendingMount() {
  cancelPendingMount();
  const observer = new MutationObserver(() => {
    if (tryMountPageUi()) {
      cancelPendingMount();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  pendingMount = observer;
}

export function setPageUiVisible(_host: Element, visible: boolean) {
  const existing = document.querySelector(PAGE_UI_SELECTOR);

  if (visible && existing == null) {
    if (!tryMountPageUi()) {
      armPendingMount();
    }
    return;
  }

  if (!visible) {
    cancelPendingMount();
  }

  if (!visible && existing != null) {
    const mounted = mountedPageUis.get(existing);
    mounted?.stop();
    mounted?.root.unmount();
    mounted?.cleanup();
    mountedPageUis.delete(existing);
    existing.remove();
    // Turning the extension off must leave YouTube stock: drop the injected
    // stylesheet and hand playback rate back at 1×.
    document.querySelector(PAGE_UI_STYLE_SELECTOR)?.remove();
    const video = findYouTubeVideo();
    if (video != null) video.playbackRate = 1;
  }
}
