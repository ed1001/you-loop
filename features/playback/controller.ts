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

  // Restrict the front edge like loop mode: anywhere before the start snaps to
  // the start (scrubbing the playhead before the region then playing should not
  // play the pre-region stretch).
  if (video.currentTime < start) {
    video.currentTime = start;
    return { oneShotCompleted: false };
  }

  if (video.currentTime < end) {
    return { oneShotCompleted: state.oneShotCompleted };
  }

  // Playback resumed after the one-shot already finished (the user pressed
  // play): restart from the segment start instead of re-pausing at the end.
  // Race-free — reads the live `paused` flag, so it does not depend on the
  // ordering of the `play`/`timeupdate` events that resume fires.
  if (state.oneShotCompleted && !video.paused) {
    video.currentTime = start;
    return { oneShotCompleted: false };
  }

  video.currentTime = end;
  video.pause();
  return { oneShotCompleted: true };
}
