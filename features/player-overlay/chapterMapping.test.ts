import { describe, expect, test } from "vitest";
import { buildTimeMap, type Segment } from "./chapterMapping";

describe("buildTimeMap — linear fallback", () => {
  test("no segments maps time linearly to percent", () => {
    const map = buildTimeMap([], 100);
    expect(map.timeToPercent(0)).toBe(0);
    expect(map.timeToPercent(25)).toBe(25);
    expect(map.timeToPercent(100)).toBe(100);
  });

  test("a single segment (no chapter gaps) stays linear", () => {
    const map = buildTimeMap([{ startFrac: 0, endFrac: 1 }], 100);
    expect(map.timeToPercent(25)).toBe(25);
    expect(map.percentToTime(25)).toBe(25);
  });

  test("clamps out-of-range input", () => {
    const map = buildTimeMap([], 100);
    expect(map.timeToPercent(-10)).toBe(0);
    expect(map.timeToPercent(999)).toBe(100);
    expect(map.percentToTime(-5)).toBe(0);
    expect(map.percentToTime(150)).toBe(100);
  });

  test("zero duration does not divide by zero", () => {
    const map = buildTimeMap([], 0);
    expect(Number.isFinite(map.timeToPercent(0))).toBe(true);
  });
});

describe("buildTimeMap — chaptered (piecewise) mapping", () => {
  // Two equal-duration chapters separated by a 10%-wide gap in the middle.
  const segments: Segment[] = [
    { startFrac: 0, endFrac: 0.45 },
    { startFrac: 0.55, endFrac: 1.0 }
  ];
  const map = buildTimeMap(segments, 100);

  test("interpolates within the first chapter", () => {
    expect(map.timeToPercent(25)).toBeCloseTo(22.5, 6);
  });

  test("the chapter boundary lands at the first segment's right edge", () => {
    expect(map.timeToPercent(50)).toBeCloseTo(45, 6);
  });

  test("interpolates within the second chapter — shifted right of linear", () => {
    // Linear would place t=75 at 75%; the gap pushes it right to 77.5%.
    expect(map.timeToPercent(75)).toBeCloseTo(77.5, 6);
  });

  test("endpoints pin to the bar edges", () => {
    expect(map.timeToPercent(0)).toBeCloseTo(0, 6);
    expect(map.timeToPercent(100)).toBeCloseTo(100, 6);
  });

  test("percentToTime inverts timeToPercent", () => {
    expect(map.percentToTime(22.5)).toBeCloseTo(25, 6);
    expect(map.percentToTime(77.5)).toBeCloseTo(75, 6);
  });

  test("a percent landing in the gap snaps to the nearest chapter edge", () => {
    expect(map.percentToTime(50)).toBeCloseTo(50, 6);
  });
});

describe("buildTimeMap — reproduces the measured 14-chapter offset", () => {
  // Real geometry captured from youtube.com/watch?v=odLKbomK6zk:
  // bar.left = 28, bar.width = 1024, 14 chapter segments (abs px).
  const BAR_LEFT = 28;
  const BAR_WIDTH = 1024;
  const rects: [number, number][] = [
    [28, 68], [72, 109], [113, 149], [153, 227], [231, 268], [272, 305],
    [309, 346], [350, 387], [391, 431], [435, 578], [582, 622], [626, 700],
    [704, 891], [895, 1052]
  ];
  const segments: Segment[] = rects.map(([l, r]) => ({
    startFrac: (l - BAR_LEFT) / BAR_WIDTH,
    endFrac: (r - BAR_LEFT) / BAR_WIDTH
  }));
  const DURATION = 317.4;
  const map = buildTimeMap(segments, DURATION);

  test("places t=75% at the native playhead, not the linear position", () => {
    const t = DURATION * 0.75; // 238.1s
    const x = BAR_LEFT + (map.timeToPercent(t) / 100) * BAR_WIDTH;
    // Native YouTube playhead measured at 805px; old linear math gave 796px.
    expect(x).toBeGreaterThan(800); // clearly past the old linear 796px
    expect(Math.abs(x - 805)).toBeLessThan(3); // within ~3px of measured native
  });
});
