import { describe, expect, it } from "vitest";
import { padZoomRegion, clampLoopToRegion, ZOOM_PAD_RATIO } from "./zoomRegion";

describe("padZoomRegion", () => {
  it("pads the loop by the ratio on each side", () => {
    const region = padZoomRegion({ start: 40, end: 60 }, 200);
    // span 20, pad 5 each side.
    expect(region.start).toBe(35);
    expect(region.end).toBe(65);
  });

  it("clamps the padded window to the video bounds", () => {
    const region = padZoomRegion({ start: 2, end: 10 }, 12);
    // span 8, pad 2 -> start 0, end 12 (both clamped).
    expect(region.start).toBe(0);
    expect(region.end).toBe(12);
  });

  it("uses the configured pad ratio", () => {
    expect(ZOOM_PAD_RATIO).toBe(0.25);
  });
});

describe("clampLoopToRegion", () => {
  it("leaves a loop already inside the region untouched", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 35, end: 65 });
    expect(loop).toEqual({ start: 40, end: 60 });
  });

  it("pulls a loop edge back inside a shrunken region", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 45, end: 55 });
    expect(loop).toEqual({ start: 45, end: 55 });
  });

  it("preserves the minimum duration when the loop sits entirely outside", () => {
    const loop = clampLoopToRegion({ start: 10, end: 20 }, { start: 50, end: 80 });
    expect(loop.start).toBe(50);
    expect(loop.end).toBeCloseTo(50.1, 5);
  });
});
