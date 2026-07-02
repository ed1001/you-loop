// Pure math for the pitch control: drag→semitone mapping, clamping, the
// frequency ratio the DSP engine consumes, and the readout label. No DOM,
// no audio — mirrors speedScrub.ts so it is fully unit-testable.

const MIN_SEMITONES = -12;
const MAX_SEMITONES = 12;
const MIN_CENTS = -50;
const MAX_CENTS = 50;

/** Vertical pixels of drag per one-semitone step. */
export const PX_PER_SEMITONE = 12;

export function clampSemitones(semitones: number): number {
  return Math.max(MIN_SEMITONES, Math.min(MAX_SEMITONES, Math.round(semitones)));
}

export function clampCents(cents: number): number {
  return Math.max(MIN_CENTS, Math.min(MAX_CENTS, Math.round(cents)));
}

/**
 * Semitone offset after dragging `dyUp` pixels upward (positive = up) from a
 * press that started at `startSemitones`. Quantized to whole semitones,
 * clamped to ±12.
 */
export function semitonesFromDrag(startSemitones: number, dyUp: number): number {
  const steps = Math.round(dyUp / PX_PER_SEMITONE);
  return clampSemitones(startSemitones + steps);
}

/** Frequency ratio for an offset. 0 → 1, +12 → 2, −12 → 0.5. */
export function pitchRatio(settings: { semitones: number; cents: number }): number {
  return Math.pow(2, (settings.semitones + settings.cents / 100) / 12);
}

/** True when the offset is audibly nothing (drives transparent bypass). */
export function isZeroPitch(settings: { semitones: number; cents: number }): boolean {
  return settings.semitones === 0 && settings.cents === 0;
}

/** Readout label: "0", "+3", "-2", "+3 +12¢", "0 -5¢". */
export function formatPitch(settings: { semitones: number; cents: number }): string {
  const { semitones, cents } = settings;
  const semStr = semitones > 0 ? `+${semitones}` : `${semitones}`;
  if (cents === 0) return semStr;
  const centStr = cents > 0 ? `+${cents}` : `${cents}`;
  return `${semStr} ${centStr}¢`;
}
