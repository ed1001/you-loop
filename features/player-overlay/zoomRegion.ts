import type { LoopSegment } from "../playback/types";
import { MIN_SEGMENT_DURATION_SECONDS } from "../playback/reducer";

// Keep the loop inside the zoom window when the window moves. Slide the loop
// along (preserving its length) rather than trimming it; only shrink it when
// the window itself is shorter than the loop.
export function clampLoopToRegion(
  loop: LoopSegment,
  region: LoopSegment
): LoopSegment {
  const windowLength = region.end - region.start;

  // Window too small to hold the minimum loop, or shorter than the loop:
  // the loop has to fill the whole window.
  const loopLength = loop.end - loop.start;
  if (windowLength <= MIN_SEGMENT_DURATION_SECONDS || loopLength >= windowLength) {
    return { start: region.start, end: region.end };
  }

  // Window can hold the loop: translate it inside, keeping its length.
  let start = loop.start;
  if (start < region.start) {
    start = region.start;
  }
  if (start + loopLength > region.end) {
    start = region.end - loopLength;
  }

  return { start, end: start + loopLength };
}
