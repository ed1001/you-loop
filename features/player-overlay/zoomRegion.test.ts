import { describe, expect, it } from "vitest";
import { clampLoopToRegion } from "./zoomRegion";

describe("clampLoopToRegion", () => {
  it("leaves a loop already inside the window untouched", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 35, end: 65 });
    expect(loop).toEqual({ start: 40, end: 60 });
  });

  it("pulls a loop edge back inside a shrunken window", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 45, end: 55 });
    expect(loop).toEqual({ start: 45, end: 55 });
  });

  it("preserves the minimum duration when the loop sits entirely outside", () => {
    const loop = clampLoopToRegion({ start: 10, end: 20 }, { start: 50, end: 80 });
    expect(loop.start).toBe(50);
    expect(loop.end).toBeCloseTo(50.1, 5);
  });
});
