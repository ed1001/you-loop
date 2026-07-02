import { describe, expect, it } from "vitest";
import { buildCountOff, roleAt, ACCENT_HZ, CLICK_HZ } from "./countOff";

const FOUR_FOUR = { beatsPerBar: 4, noteValue: 4 };

describe("roleAt", () => {
  it("accents the downbeat, clicks every other beat", () => {
    expect(roleAt(0)).toBe("accent");
    expect(roleAt(1)).toBe("click");
    expect(roleAt(2)).toBe("click");
    expect(roleAt(3)).toBe("click");
  });
});

describe("buildCountOff", () => {
  it("places beats one beat apart and totals bars*beats*beat", () => {
    const plan = buildCountOff({ meter: FOUR_FOUR, bars: 1, bpm: 120 });
    expect(plan.beats).toHaveLength(4);
    expect(plan.beats.map((b) => b.timeSec)).toEqual([0, 0.5, 1.0, 1.5]);
    expect(plan.totalSec).toBeCloseTo(2.0, 5); // loop resumes on the next downbeat
  });

  it("sounds every beat as a short pulse — no tone, no rest", () => {
    const plan = buildCountOff({ meter: FOUR_FOUR, bars: 1, bpm: 60 });
    const pulse = Math.min(0.1, 1 * 0.28);
    expect(plan.beats[0].role).toBe("accent");
    expect(plan.beats[0].freqHz).toBe(ACCENT_HZ);
    for (let i = 1; i < 4; i++) {
      expect(plan.beats[i].role).toBe("click");
      expect(plan.beats[i].freqHz).toBe(CLICK_HZ);
    }
    // every beat — including the last — is the same short pulse
    for (const b of plan.beats) expect(b.durSec).toBeCloseTo(pulse, 5);
  });

  it("accents the downbeat of every bar", () => {
    const plan = buildCountOff({ meter: FOUR_FOUR, bars: 2, bpm: 120 });
    expect(plan.beats[0].role).toBe("accent");
    expect(plan.beats[4].role).toBe("accent"); // downbeat of bar 2
    expect(plan.beats).toHaveLength(8);
  });
});
