import type { LoopSegment } from "../playback/types";
import { marksEqual, timesEqual } from "../playback/marks";
import type { CountInSettings } from "./countInStore";
import type { SavedLoop } from "./loopStore";

// Two loop segments are equal when both null or both endpoints match (within
// float tolerance).
function segmentsEqual(a: LoopSegment | null, b: LoopSegment | null): boolean {
  if (a == null || b == null) return a === b;
  return timesEqual(a.start, b.start) && timesEqual(a.end, b.end);
}

function countInEqual(a: CountInSettings, b: CountInSettings): boolean {
  return (
    a.bpm === b.bpm &&
    a.beatsPerBar === b.beatsPerBar &&
    a.noteValue === b.noteValue &&
    a.bars === b.bars
  );
}

// Whether the live state has drifted from the saved loop it came from. No
// source loop means a fresh, savable selection (dirty); an exact match of
// main, zoom, marks and — for loops that carry a tempo snapshot — count-in
// means nothing new to save. Legacy loops (no snapshot) never go tempo-dirty:
// there's nothing to compare against. No live segment is never dirty.
export function isLoopDirty(
  source: SavedLoop | undefined,
  segment: LoopSegment | null,
  zoom: LoopSegment | null,
  countIn: CountInSettings,
  marks: number[]
): boolean {
  if (segment == null) return false;
  if (source == null) return true;
  if (!segmentsEqual(source.main, segment) || !segmentsEqual(source.zoom, zoom)) {
    return true;
  }
  if (!marksEqual(source.marks, marks)) return true;
  return source.countIn != null && !countInEqual(source.countIn, countIn);
}
