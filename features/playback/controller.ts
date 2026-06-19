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

// Result of one enforcement tick. `sought` is true whenever this call wrote
// `video.currentTime` (a wrap or a snap) — the caller latches on it so it does
// not fire another seek until this one settles. Without that latch, a wrap into
// an unbuffered point (which leaves the playhead past `end` until the fetch
// lands) re-triggers every animation frame, stacking dozens of seeks and
// spiralling the player into a multi-second freeze.
export type EnforceResult = {
  oneShotCompleted: boolean;
  sought: boolean;
  wrapped: boolean;
};

// Tolerance for the front-edge snap. Seeking to a fractional `start` lands on
// the nearest frame, often a sliver *below* the requested time, so a strict
// `currentTime < start` re-fires immediately after the wrap seek lands, snapping
// again — and the new landing undershoots again. Measured live: a single wrap to
// a raw-float zoom start spawned up to 4 seeks (~30ms each), the stutter the user
// felt only when adjusting the start cursor (end is never a seek target). Only
// snap when the playhead is before start by more than this; well under a frame's
// worth is "at the start", not "before the region". 0.1s is imperceptible for
// the scrub-before-region case this guard actually exists for.
const START_SNAP_TOLERANCE_SECONDS = 0.1;

export function enforceSegmentEnd(
  video: HTMLVideoElement,
  state: PlaybackState
): EnforceResult {
  if (!state.enabled || !state.loopEnabled || !state.loopSegment) {
    return { oneShotCompleted: state.oneShotCompleted, sought: false, wrapped: false };
  }

  const { start, end } = state.loopSegment;

  if (state.playMode === "loop") {
    // Restrict the playhead to the segment: snap in from before the start
    // and wrap back to the start at the end.
    if (
      video.currentTime >= end ||
      video.currentTime < start - START_SNAP_TOLERANCE_SECONDS
    ) {
      const wrapped = video.currentTime >= end;
      video.currentTime = start;
      return { oneShotCompleted: false, sought: true, wrapped };
    }
    return { oneShotCompleted: false, sought: false, wrapped: false };
  }

  // Restrict the front edge like loop mode: anywhere before the start snaps to
  // the start (scrubbing the playhead before the region then playing should not
  // play the pre-region stretch).
  if (video.currentTime < start - START_SNAP_TOLERANCE_SECONDS) {
    video.currentTime = start;
    return { oneShotCompleted: false, sought: true, wrapped: false };
  }

  if (video.currentTime < end) {
    return { oneShotCompleted: state.oneShotCompleted, sought: false, wrapped: false };
  }

  // Playback resumed after the one-shot already finished (the user pressed
  // play): restart from the segment start instead of re-pausing at the end.
  // Race-free — reads the live `paused` flag, so it does not depend on the
  // ordering of the `play`/`timeupdate` events that resume fires.
  if (state.oneShotCompleted && !video.paused) {
    video.currentTime = start;
    return { oneShotCompleted: false, sought: true, wrapped: false };
  }

  video.currentTime = end;
  video.pause();
  return { oneShotCompleted: true, sought: true, wrapped: false };
}
