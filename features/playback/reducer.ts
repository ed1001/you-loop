import type { LoopSegment, PlaybackCommand, PlaybackState } from "./types";

export const MIN_SEGMENT_DURATION_SECONDS = 0.1;
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 3;
export const PLAYBACK_RATE_STEP = 0.25;

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
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, stepped));
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
