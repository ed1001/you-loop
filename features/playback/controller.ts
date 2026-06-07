import type { PlaybackState } from "./types";

export function applyPlaybackState(
  video: HTMLVideoElement,
  state: PlaybackState
): void {
  if (!state.enabled) return;
  if (video.playbackRate !== state.playbackRate) {
    video.playbackRate = state.playbackRate;
  }
}

export function enforceSegmentEnd(
  video: HTMLVideoElement,
  state: PlaybackState
): Pick<PlaybackState, "oneShotCompleted"> {
  if (!state.enabled || !state.loopSegment) {
    return { oneShotCompleted: state.oneShotCompleted };
  }

  const { start, end } = state.loopSegment;
  if (video.currentTime < end) {
    return { oneShotCompleted: state.oneShotCompleted };
  }

  if (state.playMode === "loop") {
    video.currentTime = start;
    return { oneShotCompleted: false };
  }

  video.currentTime = end;
  video.pause();
  return { oneShotCompleted: true };
}

export async function handleOneShotReplay(
  video: HTMLVideoElement,
  state: PlaybackState
): Promise<boolean> {
  if (
    !state.enabled ||
    state.playMode !== "one-shot" ||
    !state.oneShotCompleted ||
    !state.loopSegment
  ) {
    return false;
  }

  video.currentTime = state.loopSegment.start;
  await video.play();
  return true;
}
