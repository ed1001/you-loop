import { describe, expect, it } from "vitest";
import {
  PX_PER_SEMITONE,
  clampCents,
  clampSemitones,
  formatPitch,
  isZeroPitch,
  pitchRatio,
  semitonesFromDrag
} from "./pitchScrub";

describe("clampSemitones", () => {
  it("rounds and clamps to ±12", () => {
    expect(clampSemitones(2.4)).toBe(2);
    expect(clampSemitones(-2.6)).toBe(-3);
    expect(clampSemitones(13)).toBe(12);
    expect(clampSemitones(-99)).toBe(-12);
  });
});

describe("clampCents", () => {
  it("rounds and clamps to ±50", () => {
    expect(clampCents(12.3)).toBe(12);
    expect(clampCents(60)).toBe(50);
    expect(clampCents(-60)).toBe(-50);
  });
});

describe("semitonesFromDrag", () => {
  it("returns the start within half a step", () => {
    expect(semitonesFromDrag(0, 0)).toBe(0);
    expect(semitonesFromDrag(0, PX_PER_SEMITONE / 2 - 1)).toBe(0);
  });
  it("steps one semitone per PX_PER_SEMITONE of upward drag", () => {
    expect(semitonesFromDrag(0, PX_PER_SEMITONE)).toBe(1);
    expect(semitonesFromDrag(0, -PX_PER_SEMITONE * 2)).toBe(-2);
    expect(semitonesFromDrag(3, PX_PER_SEMITONE * 2)).toBe(5);
  });
  it("clamps at the ends", () => {
    expect(semitonesFromDrag(11, PX_PER_SEMITONE * 5)).toBe(12);
    expect(semitonesFromDrag(-11, -PX_PER_SEMITONE * 5)).toBe(-12);
  });
});

describe("pitchRatio", () => {
  it("maps semitones+cents to a frequency ratio", () => {
    expect(pitchRatio({ semitones: 0, cents: 0 })).toBe(1);
    expect(pitchRatio({ semitones: 12, cents: 0 })).toBeCloseTo(2, 10);
    expect(pitchRatio({ semitones: -12, cents: 0 })).toBeCloseTo(0.5, 10);
    expect(pitchRatio({ semitones: 1, cents: 0 })).toBeCloseTo(1.059463, 5);
    expect(pitchRatio({ semitones: 0, cents: 50 })).toBeCloseTo(1.029302, 5);
  });
});

describe("isZeroPitch", () => {
  it("is true only at exactly zero", () => {
    expect(isZeroPitch({ semitones: 0, cents: 0 })).toBe(true);
    expect(isZeroPitch({ semitones: 0, cents: 5 })).toBe(false);
    expect(isZeroPitch({ semitones: 1, cents: 0 })).toBe(false);
  });
});

describe("formatPitch", () => {
  it("formats semitones with a sign and optional cents", () => {
    expect(formatPitch({ semitones: 0, cents: 0 })).toBe("0");
    expect(formatPitch({ semitones: 3, cents: 0 })).toBe("+3");
    expect(formatPitch({ semitones: -2, cents: 0 })).toBe("-2");
    expect(formatPitch({ semitones: 3, cents: 12 })).toBe("+3 +12¢");
    expect(formatPitch({ semitones: 0, cents: -5 })).toBe("0 -5¢");
  });
});
