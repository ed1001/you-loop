import { describe, expect, it } from "vitest";
import { clampLoopToRegion } from "./zoomRegion";

describe("clampLoopToRegion", () => {
  it("leaves a loop already inside the window untouched", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 35, end: 65 });
    expect(loop).toEqual({ start: 40, end: 60 });
  });

  it("slides the loop right (keeping length) when the window start passes it", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 50, end: 90 });
    expect(loop).toEqual({ start: 50, end: 70 });
  });

  it("slides the loop left (keeping length) when the window end passes it", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 10, end: 55 });
    expect(loop).toEqual({ start: 35, end: 55 });
  });

  it("shrinks the loop only when the window is shorter than it", () => {
    const loop = clampLoopToRegion({ start: 40, end: 60 }, { start: 45, end: 55 });
    expect(loop).toEqual({ start: 45, end: 55 });
  });
});
