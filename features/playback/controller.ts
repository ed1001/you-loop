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
  if (!state.enabled || !state.loopEnabled || !state.loopSegment) {
    return { oneShotCompleted: state.oneShotCompleted };
  }

  const { start, end } = state.loopSegment;

  if (state.playMode === "loop") {
    // Restrict the playhead to the segment: snap in from before the start
    // and wrap back to the start at the end.
    if (video.currentTime >= end || video.currentTime < start) {
      video.currentTime = start;
    }
    return { oneShotCompleted: false };
  }

  if (video.currentTime < end) {
    return { oneShotCompleted: state.oneShotCompleted };
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
