// Pure math for the pitch control: drag→semitone/cents mapping, clamping, the
// frequency ratio the DSP engine consumes, tape-scrubber geometry, and the
// readout label. No DOM, no audio — mirrors speedScrub.ts so it is fully
// unit-testable.

const MIN_SEMITONES = -12;
const MAX_SEMITONES = 12;
const MIN_CENTS = -50;
const MAX_CENTS = 50;

/** Vertical pixels of drag per one-semitone step. */
export const PX_PER_SEMITONE = 14;

/** Vertical pixels of drag per cent in fine gear (5¢ per tick row). */
export const PX_PER_CENT = 1.4;

/** Cents between ticks on the fine tape. */
export const CENTS_TICK_STEP = 5;

/** Visible height of the tape window, in px. Needle sits at its midpoint. */
export const TAPE_WINDOW_PX = 148;

/** Dead zone before a rightward drag starts revealing the reset target. */
export const RESET_REVEAL_DX = 10;

/** Rightward drag distance at which releasing resets to 0. */
export const RESET_ARM_DX = 72;

/** Dead zone before a leftward drag starts revealing the fine target. */
export const FINE_REVEAL_DX = 10;

/** Leftward drag distance at which the scrub latches into fine (cents) gear. */
export const FINE_ARM_DX = 48;

export function clampSemitones(semitones: number): number {
  // NaN survives min/max (and ±Infinity would pin to an extreme); a corrupt
  // stored value must land on the neutral 0, not in the audio engine.
  if (!Number.isFinite(semitones)) return 0;
  return Math.max(MIN_SEMITONES, Math.min(MAX_SEMITONES, Math.round(semitones)));
}

export function clampCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
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

/**
 * Cents after dragging `dyUp` pixels upward in fine gear from `startCents`.
 * Quantized to whole cents, clamped to ±50.
 */
export function centsFromDrag(startCents: number, dyUp: number): number {
  return clampCents(startCents + dyUp / PX_PER_CENT);
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

/**
 * Progress of the fine gesture for a leftward drag of `dxLeft` pixels
 * (positive = leftward): 0 inside the dead zone, 1 at/beyond the latch
 * threshold. ≥ 1 latches the drag into cents gear for the rest of the hold.
 */
export function fineProgress(dxLeft: number): number {
  const p = (dxLeft - FINE_REVEAL_DX) / (FINE_ARM_DX - FINE_REVEAL_DX);
  return Math.min(1, Math.max(0, p));
}

/** Tape-local y position (px from tape top) of a semitone stop. Low at top. */
export function semitoneTapeY(semitones: number): number {
  return (semitones - MIN_SEMITONES) * PX_PER_SEMITONE;
}

/** translateY for the semitone tape so `semitones` sits under the needle. */
export function semitoneTapeOffset(semitones: number): number {
  return TAPE_WINDOW_PX / 2 - semitoneTapeY(semitones);
}

/** All semitone stops, −12…+12. */
export function semitoneTapeStops(): number[] {
  return Array.from(
    { length: MAX_SEMITONES - MIN_SEMITONES + 1 },
    (_, i) => MIN_SEMITONES + i
  );
}

/** Tape-local y position (px from tape top) of a cents stop. Low at top. */
export function centsTapeY(cents: number): number {
  return (cents - MIN_CENTS) * PX_PER_CENT;
}

/** translateY for the cents tape so `cents` sits under the needle. */
export function centsTapeOffset(cents: number): number {
  return TAPE_WINDOW_PX / 2 - centsTapeY(cents);
}

/** Cents stops every 5¢, −50…+50. */
export function centsTapeStops(): number[] {
  const count = (MAX_CENTS - MIN_CENTS) / CENTS_TICK_STEP + 1;
  return Array.from({ length: count }, (_, i) => MIN_CENTS + i * CENTS_TICK_STEP);
}

/** Frequency ratio for an offset. 0 → 1, +12 → 2, −12 → 0.5. */
export function pitchRatio(settings: { semitones: number; cents: number }): number {
  return Math.pow(2, (settings.semitones + settings.cents / 100) / 12);
}

/** True when the offset is audibly nothing (drives transparent bypass). */
export function isZeroPitch(settings: { semitones: number; cents: number }): boolean {
  return settings.semitones === 0 && settings.cents === 0;
}

/** Signed integer label: "+3", "0", "-2". */
export function formatSemitones(semitones: number): string {
  return semitones > 0 ? `+${semitones}` : `${semitones}`;
}

/** Signed cents label: "+12¢", "0¢", "-5¢". */
export function formatCents(cents: number): string {
  return cents > 0 ? `+${cents}¢` : `${cents}¢`;
}

/** Readout label: "0", "+3", "-2", "+3 +12¢", "0 -5¢". */
export function formatPitch(settings: { semitones: number; cents: number }): string {
  const semStr = formatSemitones(settings.semitones);
  if (settings.cents === 0) return semStr;
  return `${semStr} ${formatCents(settings.cents)}`;
}

/**
 * Pill label as a decimal semitone count — cents are hundredths of a
 * semitone, so the total offset is exact: +3 +45¢ → "+3.45", +3 −5¢ →
 * "+2.95", 0 → "0". Whole semitones stay bare ("+3"), so a fraction on the
 * pill is itself the signal that a fine trim is applied.
 */
export function formatPitchDecimal(settings: {
  semitones: number;
  cents: number;
}): string {
  const total = Number((settings.semitones + settings.cents / 100).toFixed(2));
  return total > 0 ? `+${total}` : `${total}`;
}

// Keyboard slider semantics mirroring the speed pill: arrows nudge a semitone
// (with shift: trim 5¢), Page keys jump an octave, Home/End hit the range ends.
const KEY_STEPS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
  PageUp: 12,
  PageDown: -12
};

const KEY_JUMPS: Record<string, number> = {
  Home: MIN_SEMITONES,
  End: MAX_SEMITONES
};

/**
 * Settings after a keyboard nudge, or null when the key is not a pitch key.
 * Reset keys are not handled here — they are the caller's gesture.
 */
export function pitchFromKey(
  settings: { semitones: number; cents: number },
  key: string,
  shiftKey: boolean
): { semitones: number; cents: number } | null {
  const step = KEY_STEPS[key];
  if (step != null) {
    return shiftKey
      ? { ...settings, cents: clampCents(settings.cents + step * 5) }
      : { ...settings, semitones: clampSemitones(settings.semitones + step) };
  }
  const jump = KEY_JUMPS[key];
  if (jump != null) return { ...settings, semitones: jump };
  return null;
}
