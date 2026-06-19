import { describe, expect, it } from "vitest";
import {
  buildCountOff,
  roleAt,
  ACCENT_HZ,
  CLICK_HZ,
  SUSTAIN_HZ
} from "./countOff";

const FOUR_FOUR = { beatsPerBar: 4, noteValue: 4 };

describe("roleAt", () => {
  it("final 4/4 bar is staccato, staccato, sustain, rest", () => {
    expect(roleAt(0, 0, 1, 4)).toBe("staccato");
    expect(roleAt(0, 1, 1, 4)).toBe("staccato");
    expect(roleAt(0, 2, 1, 4)).toBe("sustain");
    expect(roleAt(0, 3, 1, 4)).toBe("rest");
  });

  it("earlier bars are a metronome with an accented downbeat", () => {
    expect(roleAt(0, 0, 2, 4)).toBe("accent");
    expect(roleAt(0, 1, 2, 4)).toBe("click");
    // bar 1 is the final bar → cue pattern
    expect(roleAt(1, 2, 2, 4)).toBe("sustain");
    expect(roleAt(1, 3, 2, 4)).toBe("rest");
  });

  it("a 2-beat final bar is sustain then rest", () => {
    expect(roleAt(0, 0, 1, 2)).toBe("sustain");
    expect(roleAt(0, 1, 1, 2)).toBe("rest");
  });
});

describe("buildCountOff", () => {
  it("places beats one beat apart and totals bars*beats*beat", () => {
    const plan = buildCountOff({ meter: FOUR_FOUR, bars: 1, bpm: 120 });
    const beat = 60 / 120; // 0.5s
    expect(plan.beats).toHaveLength(4);
    expect(plan.beats.map((b) => b.timeSec)).toEqual([0, 0.5, 1.0, 1.5]);
    expect(plan.totalSec).toBeCloseTo(2.0, 5);
  });

  it("assigns frequencies and durations by role", () => {
    const plan = buildCountOff({ meter: FOUR_FOUR, bars: 1, bpm: 60 });
    const [b1, , b3, b4] = plan.beats;
    expect(b1.role).toBe("staccato");
    expect(b1.freqHz).toBe(CLICK_HZ);
    expect(b1.durSec).toBeCloseTo(Math.min(0.1, 1 * 0.28), 5);
    expect(b3.role).toBe("sustain");
    expect(b3.freqHz).toBe(SUSTAIN_HZ);
    expect(b3.durSec).toBeCloseTo(1, 5); // one full beat at 60bpm
    expect(b4.role).toBe("rest");
    expect(b4.freqHz).toBe(0);
    expect(b4.durSec).toBe(0);
  });

  it("accents the downbeat of non-final bars", () => {
    const plan = buildCountOff({ meter: FOUR_FOUR, bars: 2, bpm: 120 });
    expect(plan.beats[0].role).toBe("accent");
    expect(plan.beats[0].freqHz).toBe(ACCENT_HZ);
    expect(plan.beats).toHaveLength(8);
  });
});
