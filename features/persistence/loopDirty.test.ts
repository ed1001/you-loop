import { describe, expect, it } from "vitest";
import { isLoopDirty } from "./loopDirty";
import type { SavedLoop } from "./loopStore";
import { DEFAULT_COUNT_IN_SETTINGS, type CountInSettings } from "./countInStore";
import type { LoopSegment } from "../playback/types";

const ci = DEFAULT_COUNT_IN_SETTINGS;
const saved: SavedLoop = {
  id: "l1",
  name: "Verse",
  main: { start: 42.125, end: 63.5 },
  zoom: { start: 45, end: 50 },
  countIn: ci,
  marks: [46.25, 48]
};
const clean = (): [SavedLoop, LoopSegment, LoopSegment, CountInSettings, number[]] => [
  saved,
  { ...saved.main },
  { ...saved.zoom! },
  { ...ci },
  [...saved.marks!]
];

describe("isLoopDirty", () => {
  it("is clean when everything matches", () => {
    expect(isLoopDirty(...clean())).toBe(false);
  });

  it("tolerates float noise on times", () => {
    const [s, , , c, m] = clean();
    expect(
      isLoopDirty(
        s,
        { start: 42.1250000001, end: 63.4999999 },
        { start: 45.0000002, end: 49.9999998 },
        c,
        [46.2500001, 47.9999999]
      )
    ).toBe(false);
  });

  it("detects a moved main loop", () => {
    const [s, , z, c, m] = clean();
    expect(isLoopDirty(s, { start: 42.126, end: 63.5 }, z, c, m)).toBe(true);
    expect(isLoopDirty(s, { start: 42.125, end: 63.501 }, z, c, m)).toBe(true);
  });

  it("detects a changed or removed zoom", () => {
    const [s, main, , c, m] = clean();
    expect(isLoopDirty(s, main, { start: 45.5, end: 50 }, c, m)).toBe(true);
    expect(isLoopDirty(s, main, null, c, m)).toBe(true);
  });

  it("detects added, moved or removed marks", () => {
    const [s, main, z, c] = clean();
    expect(isLoopDirty(s, main, z, c, [46.25, 48, 49])).toBe(true);
    expect(isLoopDirty(s, main, z, c, [46.26, 48])).toBe(true);
    expect(isLoopDirty(s, main, z, c, [48])).toBe(true);
  });

  it("treats missing marks on a legacy loop as none", () => {
    const [, main, z, c] = clean();
    const legacy = { ...saved, marks: undefined };
    expect(isLoopDirty(legacy, main, z, c, [])).toBe(false);
    expect(isLoopDirty(legacy, main, z, c, [47])).toBe(true);
  });

  it("detects each count-in field", () => {
    const [s, main, z, , m] = clean();
    expect(isLoopDirty(s, main, z, { ...ci, bpm: ci.bpm + 1 }, m)).toBe(true);
    expect(isLoopDirty(s, main, z, { ...ci, beatsPerBar: ci.beatsPerBar + 1 }, m)).toBe(true);
    expect(isLoopDirty(s, main, z, { ...ci, noteValue: ci.noteValue === 4 ? 8 : 4 }, m)).toBe(true);
    expect(isLoopDirty(s, main, z, { ...ci, bars: ci.bars + 1 }, m)).toBe(true);
  });

  it("never goes tempo-dirty on a loop without a count-in snapshot", () => {
    const [, main, z, , m] = clean();
    const legacy = { ...saved, countIn: null };
    expect(isLoopDirty(legacy, main, z, { ...ci, bpm: 200 }, m)).toBe(false);
  });

  it("no source loop is dirty; no live segment is clean", () => {
    const [s, main, z, c, m] = clean();
    expect(isLoopDirty(undefined, main, z, c, m)).toBe(true);
    expect(isLoopDirty(s, null, z, c, m)).toBe(false);
  });
});
