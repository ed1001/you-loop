import { describe, expect, it } from "vitest";
import {
  CENTS_TICK_STEP,
  PX_PER_CENT,
  PX_PER_SEMITONE,
  RESET_ARM_DX,
  RESET_REVEAL_DX,
  TAPE_WINDOW_PX,
  centsFromDrag,
  centsTapeOffset,
  centsTapeStops,
  centsTapeY,
  clampCents,
  clampSemitones,
  formatPitch,
  formatPitchDecimal,
  isZeroPitch,
  pitchFromKey,
  pitchRatio,
  resetProgress,
  semitoneTapeOffset,
  semitoneTapeStops,
  semitoneTapeY,
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

describe("centsFromDrag", () => {
  it("moves whole cents per PX_PER_CENT of upward drag", () => {
    expect(centsFromDrag(0, 0)).toBe(0);
    expect(centsFromDrag(0, PX_PER_CENT * 10)).toBe(10);
    expect(centsFromDrag(20, -PX_PER_CENT * 5)).toBe(15);
  });
  it("clamps at ±50", () => {
    expect(centsFromDrag(40, PX_PER_CENT * 100)).toBe(50);
    expect(centsFromDrag(-40, -PX_PER_CENT * 100)).toBe(-50);
  });
});

describe("resetProgress", () => {
  it("is 0 in the dead zone, 1 at the arm threshold", () => {
    expect(resetProgress(0)).toBe(0);
    expect(resetProgress(RESET_REVEAL_DX)).toBe(0);
    expect(resetProgress(RESET_ARM_DX)).toBe(1);
    expect(resetProgress(RESET_ARM_DX + 40)).toBe(1);
  });
  it("ramps between the thresholds", () => {
    const mid = (RESET_REVEAL_DX + RESET_ARM_DX) / 2;
    expect(resetProgress(mid)).toBeCloseTo(0.5, 5);
  });
});

describe("semitone tape", () => {
  it("spans −12…+12 one stop per semitone", () => {
    const stops = semitoneTapeStops();
    expect(stops[0]).toBe(-12);
    expect(stops[stops.length - 1]).toBe(12);
    expect(stops).toHaveLength(25);
  });
  it("positions stops linearly and centers the current stop", () => {
    expect(semitoneTapeY(-12)).toBe(0);
    expect(semitoneTapeY(0)).toBe(12 * PX_PER_SEMITONE);
    expect(semitoneTapeOffset(0)).toBe(TAPE_WINDOW_PX / 2 - 12 * PX_PER_SEMITONE);
  });
});

describe("cents tape", () => {
  it("spans −50…+50 in 5¢ stops", () => {
    const stops = centsTapeStops();
    expect(stops[0]).toBe(-50);
    expect(stops[stops.length - 1]).toBe(50);
    expect(stops).toHaveLength(100 / CENTS_TICK_STEP + 1);
  });
  it("positions stops linearly and centers the current cents", () => {
    expect(centsTapeY(-50)).toBe(0);
    expect(centsTapeY(0)).toBe(50 * PX_PER_CENT);
    expect(centsTapeOffset(0)).toBe(TAPE_WINDOW_PX / 2 - 50 * PX_PER_CENT);
  });
});

describe("pitchFromKey", () => {
  const at = (semitones: number, cents: number) => ({ semitones, cents });

  it("arrows nudge a semitone", () => {
    expect(pitchFromKey(at(2, 0), "ArrowUp", false)).toEqual(at(3, 0));
    expect(pitchFromKey(at(2, 0), "ArrowDown", false)).toEqual(at(1, 0));
    expect(pitchFromKey(at(12, 0), "ArrowRight", false)).toEqual(at(12, 0));
  });

  it("shift+arrows trim 5¢", () => {
    expect(pitchFromKey(at(2, 0), "ArrowUp", true)).toEqual(at(2, 5));
    expect(pitchFromKey(at(2, -48), "ArrowLeft", true)).toEqual(at(2, -50));
  });

  it("Page keys jump an octave, Home/End hit the ends", () => {
    expect(pitchFromKey(at(0, 0), "PageUp", false)).toEqual(at(12, 0));
    expect(pitchFromKey(at(5, 0), "PageDown", false)).toEqual(at(-7, 0));
    expect(pitchFromKey(at(5, 3), "Home", false)).toEqual(at(-12, 3));
    expect(pitchFromKey(at(5, 3), "End", false)).toEqual(at(12, 3));
  });

  it("ignores non-pitch keys", () => {
    expect(pitchFromKey(at(0, 0), "a", false)).toBeNull();
    expect(pitchFromKey(at(0, 0), "Escape", false)).toBeNull();
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

describe("formatPitchDecimal", () => {
  it("folds cents into a decimal semitone count", () => {
    expect(formatPitchDecimal({ semitones: 0, cents: 0 })).toBe("0");
    expect(formatPitchDecimal({ semitones: 3, cents: 0 })).toBe("+3");
    expect(formatPitchDecimal({ semitones: 3, cents: 45 })).toBe("+3.45");
    expect(formatPitchDecimal({ semitones: 3, cents: -5 })).toBe("+2.95");
    expect(formatPitchDecimal({ semitones: -2, cents: -50 })).toBe("-2.5");
    expect(formatPitchDecimal({ semitones: 0, cents: 5 })).toBe("+0.05");
  });
});
