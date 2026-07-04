import { describe, expect, it } from "vitest";
import {
  addMark,
  removeMark,
  resolveSegment,
  isInertMark,
  marksEqual,
  sanitizeMarks
} from "./marks";

describe("addMark", () => {
  it("inserts keeping sort order", () => {
    expect(addMark([10, 30], 20)).toEqual([10, 20, 30]);
  });

  it("rounds to 3dp", () => {
    expect(addMark([], 1.23456)).toEqual([1.235]);
  });

  it("dedupes an existing time (post-rounding)", () => {
    expect(addMark([1.235], 1.2351)).toEqual([1.235]);
  });

  it("does not mutate the input array", () => {
    const input = [10];
    addMark(input, 5);
    expect(input).toEqual([10]);
  });
});

describe("removeMark", () => {
  it("removes the given time", () => {
    expect(removeMark([10, 20, 30], 20)).toEqual([10, 30]);
  });

  it("is a no-op for an unknown time", () => {
    expect(removeMark([10], 99)).toEqual([10]);
  });
});

describe("resolveSegment", () => {
  const base = { start: 10, end: 20 };

  it("returns base unchanged when activeMark is null", () => {
    expect(resolveSegment(base, null)).toBe(base);
  });

  it("passes null base through", () => {
    expect(resolveSegment(null, 15)).toBeNull();
  });

  it("swaps the start when the mark is inside the base", () => {
    expect(resolveSegment(base, 15)).toEqual({ start: 15, end: 20 });
  });

  it("ignores a mark at or below the base start", () => {
    expect(resolveSegment(base, 10)).toBe(base);
    expect(resolveSegment(base, 5)).toBe(base);
  });

  it("ignores a mark that leaves less than the minimum loop length", () => {
    // MIN_SEGMENT_DURATION_SECONDS = 0.1 — a mark at 19.95 leaves only 0.05s.
    expect(resolveSegment(base, 19.95)).toBe(base);
    // Exactly at end − 0.1 is allowed.
    expect(resolveSegment(base, 19.9)).toEqual({ start: 19.9, end: 20 });
  });
});

describe("isInertMark", () => {
  const loop = { start: 10, end: 20 };

  it("live strictly inside the loop", () => {
    expect(isInertMark(15, loop)).toBe(false);
  });

  it("inert at/below start and in the too-short tail", () => {
    expect(isInertMark(10, loop)).toBe(true);
    expect(isInertMark(8, loop)).toBe(true);
    expect(isInertMark(19.95, loop)).toBe(true);
    expect(isInertMark(25, loop)).toBe(true);
  });
});

describe("marksEqual", () => {
  it("treats undefined as empty", () => {
    expect(marksEqual(undefined, [])).toBe(true);
    expect(marksEqual(undefined, undefined)).toBe(true);
    expect(marksEqual(undefined, [1])).toBe(false);
  });

  it("compares element-wise", () => {
    expect(marksEqual([1, 2], [1, 2])).toBe(true);
    expect(marksEqual([1, 2], [1, 3])).toBe(false);
    expect(marksEqual([1], [1, 2])).toBe(false);
  });
});

describe("sanitizeMarks", () => {
  it("passes a clean array through sorted and deduped", () => {
    expect(sanitizeMarks([30, 10, 10])).toEqual([10, 30]);
  });

  it("drops non-finite, non-positive, and non-number entries", () => {
    expect(sanitizeMarks([5, NaN, Infinity, -1, 0, "x", null])).toEqual([5]);
  });

  it("returns [] for a non-array", () => {
    expect(sanitizeMarks("garbage")).toEqual([]);
    expect(sanitizeMarks(null)).toEqual([]);
    expect(sanitizeMarks(undefined)).toEqual([]);
  });
});
