import type { LoopSegment } from "../playback/types";
import { MIN_SEGMENT_DURATION_SECONDS } from "../playback/reducer";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Keep the loop inside the zoom window after the window shrinks, preserving at
// least the minimum segment duration.
export function clampLoopToRegion(
  loop: LoopSegment,
  region: LoopSegment
): LoopSegment {
  const min = MIN_SEGMENT_DURATION_SECONDS;
  // Window too small to hold a minimum loop: collapse the loop to the window.
  if (region.end - region.start <= min) {
    return { start: region.start, end: region.end };
  }

  let start = clamp(loop.start, region.start, region.end);
  let end = clamp(loop.end, region.start, region.end);

  if (end - start < min) {
    end = Math.min(region.end, start + min);
    start = Math.max(region.start, end - min);
  }

  return { start, end };
}
