import type { LoopSegment } from "../playback/types";
import { MIN_SEGMENT_DURATION_SECONDS } from "../playback/reducer";

export const ZOOM_PAD_RATIO = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// The magnified window the zoom timeline shows: the loop plus padding on each
// side (so the loop cursors have room to drag inward and outward), clamped to
// the video bounds.
export function padZoomRegion(
  loop: LoopSegment,
  duration: number,
  padRatio: number = ZOOM_PAD_RATIO
): LoopSegment {
  const span = Math.max(loop.end - loop.start, MIN_SEGMENT_DURATION_SECONDS);
  const pad = span * padRatio;
  const safeDuration = Math.max(duration, loop.end);

  return {
    start: Math.max(0, loop.start - pad),
    end: Math.min(safeDuration, loop.end + pad)
  };
}

// Keep the loop inside the region after the region shrinks, preserving at least
// the minimum segment duration.
export function clampLoopToRegion(
  loop: LoopSegment,
  region: LoopSegment
): LoopSegment {
  const min = MIN_SEGMENT_DURATION_SECONDS;
  // Region too small to hold a minimum loop: collapse the loop to the region.
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
