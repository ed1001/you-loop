// Pure math for the press-and-drag speed scrubber. The control is a fixed
// needle with a tick tape sliding behind it: dragging up pulls faster rates
// into the needle (content follows the finger, like a picker wheel), and
// dragging hard right arms a snap-back-to-1× release gesture.
import {
  clampPlaybackRate,
  MIN_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  PLAYBACK_RATE_STEP
} from "../playback/reducer";

/** Vertical pixels of drag per 0.05× step. */
export const PX_PER_STEP = 8;

/** Visible height of the tape window, in px. Needle sits at its midpoint. */
export const TAPE_WINDOW_PX = 148;

/** Dead zone before a rightward drag starts revealing the reset target. */
export const RESET_REVEAL_DX = 10;

/** Rightward drag distance at which releasing resets to 1×. */
export const RESET_ARM_DX = 72;

/**
 * Rate after dragging `dyUp` pixels upward (positive = up) from a press that
 * started at `startRate`. Quantized to 0.05 steps, clamped to 0.25–3.
 */
export function rateFromDrag(startRate: number, dyUp: number): number {
  const steps = Math.round(dyUp / PX_PER_STEP);
  return clampPlaybackRate(startRate + steps * PLAYBACK_RATE_STEP);
}

/**
 * Progress of the reset gesture for a rightward drag of `dx` pixels:
 * 0 inside the dead zone, 1 at/beyond the arm threshold. Drives the reset
 * target's reveal; ≥ 1 means releasing now resets.
 */
export function resetProgress(dx: number): number {
  const p = (dx - RESET_REVEAL_DX) / (RESET_ARM_DX - RESET_REVEAL_DX);
  return Math.min(1, Math.max(0, p));
}

/** Tape-local y position (px from tape top) of a rate. Slow at top. */
export function tapeY(rate: number): number {
  return ((rate - MIN_PLAYBACK_RATE) / PLAYBACK_RATE_STEP) * PX_PER_STEP;
}

/** translateY for the tape so `rate` sits under the fixed center needle. */
export function tapeOffset(rate: number): number {
  return TAPE_WINDOW_PX / 2 - tapeY(rate);
}

/** All scale stops from 0.25× to 3× in 0.05 steps, float-exact. */
export function tapeStops(): number[] {
  const count =
    Math.round((MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE) / PLAYBACK_RATE_STEP) + 1;
  return Array.from({ length: count }, (_, i) =>
    Number((MIN_PLAYBACK_RATE + i * PLAYBACK_RATE_STEP).toFixed(2))
  );
}
