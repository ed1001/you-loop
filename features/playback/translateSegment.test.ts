import { describe, expect, it } from "vitest";
import { translateSegment } from "./translateSegment";

const bounds = { min: 0, max: 120 };

describe("translateSegment", () => {
  it("slides both ends by delta, preserving length", () => {
    expect(translateSegment({ start: 20, end: 40 }, 10, bounds)).toEqual({
      start: 30,
      end: 50
    });
  });

  it("slides backward with a negative delta", () => {
    expect(translateSegment({ start: 20, end: 40 }, -5, bounds)).toEqual({
      start: 15,
      end: 35
    });
  });

  it("clamps flush at the upper bound, keeping length", () => {
    expect(translateSegment({ start: 100, end: 110 }, 50, bounds)).toEqual({
      start: 110,
      end: 120
    });
  });

  it("clamps flush at the lower bound, keeping length", () => {
    expect(translateSegment({ start: 10, end: 30 }, -50, bounds)).toEqual({
      start: 0,
      end: 20
    });
  });

  it("clamps within non-zero bounds (zoom sub-region)", () => {
    expect(
      translateSegment({ start: 50, end: 60 }, 100, { min: 40, max: 80 })
    ).toEqual({ start: 70, end: 80 });
  });

  it("rounds to 3 decimals", () => {
    expect(translateSegment({ start: 1, end: 2 }, 0.0001, bounds)).toEqual({
      start: 1,
      end: 2
    });
  });

  it("pins to the low edge when the window is as wide as its bounds", () => {
    expect(
      translateSegment({ start: 0, end: 40 }, 10, { min: 0, max: 40 })
    ).toEqual({ start: 0, end: 40 });
  });
});
