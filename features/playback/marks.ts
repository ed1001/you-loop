import type { LoopSegment } from "./types";
import { MIN_SEGMENT_DURATION_SECONDS } from "./reducer";

// Deep-study practice marks: absolute video times (seconds) inside the loop.
// Clicking one on the zoom strip makes it a temporary loop start — playback
// then loops [mark, loop end] until it is clicked off. Times are pinned to
// 3dp (same discipline as normalizeLoopSegment) so equality checks — the
// toggle/remove hit-tests and the saved-loop dirty compare — are exact.

const round3 = (time: number): number => Number(time.toFixed(3));

// Insert `time` keeping the list sorted; a duplicate (post-rounding) is a
// no-op. Never mutates the input.
export function addMark(marks: number[], time: number): number[] {
  const t = round3(time);
  if (marks.includes(t)) return [...marks];
  return [...marks, t].sort((a, b) => a - b);
}

export function removeMark(marks: number[], time: number): number[] {
  return marks.filter((m) => m !== time);
}

// True when the mark cannot act as a loop start inside `loop`: at/before the
// start, or so close to the end that [mark, end] would violate the minimum
// loop length. Inert marks stay stored and rendered (dimmed) but are ignored
// by playback.
export function isInertMark(time: number, loop: LoopSegment): boolean {
  return time <= loop.start || time > loop.end - MIN_SEGMENT_DURATION_SECONDS;
}

// The segment playback obeys: with a live active mark inside `base`, the loop
// starts at the mark; otherwise `base` unchanged (including base == null).
export function resolveSegment(
  base: LoopSegment | null,
  activeMark: number | null
): LoopSegment | null {
  if (base == null || activeMark == null) return base;
  if (isInertMark(activeMark, base)) return base;
  return { start: activeMark, end: base.end };
}

// Times are pinned to 3dp, so two times within half a millisecond are the
// same time; the slack absorbs float noise from arithmetic on stored values.
const TIME_EPSILON = 0.0005;

export function timesEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < TIME_EPSILON;
}

// Element-wise compare for the saved-loop dirty check. Legacy loops lack the
// marks field entirely — undefined counts as empty.
export function marksEqual(
  a: number[] | undefined,
  b: number[] | undefined
): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => timesEqual(v, y[i]));
}

// Storage-read boundary (same role as sanitizeCountInSettings): a corrupt
// sync write can never reach playback. Keeps finite positive numbers only,
// rounds to 3dp, deduped and sorted.
export function sanitizeMarks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const clean = value
    .filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
    )
    .map(round3);
  return [...new Set(clean)].sort((a, b) => a - b);
}
