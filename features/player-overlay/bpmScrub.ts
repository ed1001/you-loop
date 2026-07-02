// Pure math for the press-and-drag BPM scrubber, mirroring the speed scrubber:
// a fixed needle with a tick tape sliding behind it. Dragging up pulls higher
// tempos into the needle (content follows the finger, like a picker wheel).
import { clampBpm, MIN_BPM, MAX_BPM } from "../playback/tapTempo";

/** Vertical pixels of drag per 1 BPM. */
export const PX_PER_BPM = 4;

/** Visible height of the tape window, in px. Needle sits at its midpoint. */
export const BPM_WINDOW_PX = 150;

/** Tick spacing on the tape, in BPM. */
const TICK_STEP = 5;

/** A tick at a multiple of 20 carries a printed label. */
export const isLabeledBpm = (bpm: number) => bpm % 20 === 0;

/**
 * BPM after dragging `dyUp` pixels upward (positive = up) from a press that
 * started at `startBpm`. Quantized to whole BPM, clamped to 40–220.
 */
export function bpmFromDrag(startBpm: number, dyUp: number): number {
  return clampBpm(startBpm + Math.round(dyUp / PX_PER_BPM));
}

/** Tape-local y position (px from tape top) of a tempo. Slow at top. */
export function tapeY(bpm: number): number {
  return (bpm - MIN_BPM) * PX_PER_BPM;
}

/** translateY for the tape so `bpm` sits under the fixed center needle. */
export function tapeOffset(bpm: number): number {
  return BPM_WINDOW_PX / 2 - tapeY(bpm);
}

/** All tick stops from 40 to 220 in TICK_STEP increments. */
export function tapeStops(): number[] {
  const count = Math.round((MAX_BPM - MIN_BPM) / TICK_STEP) + 1;
  return Array.from({ length: count }, (_, i) => MIN_BPM + i * TICK_STEP);
}
