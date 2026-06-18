import type { LoopSegment } from "./types";

export type MoveBounds = { min: number; max: number };

// Slide a loop segment by `delta` seconds without changing its length. The move
// (not the length) is clamped: near a bound the window slides flush to the edge
// and keeps its length; pushing further is a no-op. `bounds` is [0, duration]
// for the main loop, or the main loop's [start, end] for the zoom sub-region.
export function translateSegment(
  segment: LoopSegment,
  delta: number,
  bounds: MoveBounds
): LoopSegment {
  const len = Number((segment.end - segment.start).toFixed(3));
  const maxStart = Math.max(bounds.min, bounds.max - len);
  const start = Math.min(maxStart, Math.max(bounds.min, segment.start + delta));
  return {
    start: Number(start.toFixed(3)),
    end: Number((start + len).toFixed(3))
  };
}
