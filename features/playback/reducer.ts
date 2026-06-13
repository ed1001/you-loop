import type { LoopSegment, PlaybackCommand, PlaybackState } from "./types";

// Floor on loop length, for the main loop and the zoom sub-region alike. Only a
// degeneracy guard: it keeps start strictly below end so the loop can't collapse
// to zero length (which would wrap every frame). It is NOT an anti-stutter
// throttle — the old 1s floor was a band-aid for a wrap-stutter that turned out
// to be a re-seek bug (a fractional start the player could never land on exactly;
// fixed in controller.ts with a snap tolerance). With that fixed, short practice
// loops play cleanly, so this is just large enough to avoid a zero/inverted loop.
export const MIN_SEGMENT_DURATION_SECONDS = 0.1;
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 3;
export const PLAYBACK_RATE_STEP = 0.05;

export function createInitialPlaybackState(): PlaybackState {
  return {
    enabled: true,
    loopEnabled: false,
    loopSegment: null,
    playMode: "loop",
    playbackRate: 1,
    oneShotCompleted: false
  };
}

export function clampPlaybackRate(rate: number): number {
  const stepped = Math.round(rate / PLAYBACK_RATE_STEP) * PLAYBACK_RATE_STEP;
  const clamped = Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, stepped));
  // Steps of 0.05 accumulate float error (0.05 * 3 = 0.15000…02); pin to 2dp.
  return Number(clamped.toFixed(2));
}

export function normalizeLoopSegment(segment: LoopSegment): LoopSegment {
  const start = Math.max(0, segment.start);
  const minEnd = start + MIN_SEGMENT_DURATION_SECONDS;
  const end = Math.max(minEnd, segment.end);

  return {
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3))
  };
}

// A fresh video with no saved loops seeds its loop to the whole timeline, so
// turning the loop on never yanks the playhead into a region the user didn't pick.
export function defaultLoopSegment(duration: number): LoopSegment {
  return normalizeLoopSegment({ start: 0, end: duration });
}

export function playbackReducer(
  state: PlaybackState,
  command: PlaybackCommand
): PlaybackState {
  switch (command.type) {
    case "setLoopSegment":
      return {
        ...state,
        loopSegment: normalizeLoopSegment(command.segment),
        oneShotCompleted: false
      };
    case "setLoopEnabled":
      return { ...state, loopEnabled: command.enabled, oneShotCompleted: false };
    case "clearLoop":
      return { ...state, loopSegment: null, oneShotCompleted: false };
    case "setPlaybackRate":
      return { ...state, playbackRate: clampPlaybackRate(command.rate) };
    case "resetPlaybackRate":
      return { ...state, playbackRate: 1 };
    case "setPlayMode":
      return { ...state, playMode: command.mode, oneShotCompleted: false };
    case "setEnabled":
      return { ...state, enabled: command.enabled };
    case "markOneShotCompleted":
      return { ...state, oneShotCompleted: command.completed };
    default:
      return state;
  }
}
