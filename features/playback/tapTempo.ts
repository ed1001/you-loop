export const MIN_BPM = 40;
export const MAX_BPM = 400;

export function clampBpm(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

// Average the consecutive intervals of the tap timestamps (ms). Needs >= 2
// taps. Returns null otherwise so the caller can ignore a lone tap.
export function bpmFromTaps(timestampsMs: number[]): number | null {
  if (timestampsMs.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < timestampsMs.length; i++) {
    sum += timestampsMs[i] - timestampsMs[i - 1];
  }
  const avg = sum / (timestampsMs.length - 1);
  if (avg <= 0) return null;
  return clampBpm(60000 / avg);
}
