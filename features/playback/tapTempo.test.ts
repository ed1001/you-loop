import { describe, expect, it } from "vitest";
import { bpmFromTaps, clampBpm, MIN_BPM, MAX_BPM } from "./tapTempo";

describe("bpmFromTaps", () => {
  it("returns null with fewer than two taps", () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps([1000])).toBeNull();
  });

  it("computes BPM from the average interval", () => {
    // 500ms apart → 120 BPM
    expect(bpmFromTaps([0, 500, 1000, 1500])).toBe(120);
  });

  it("rounds to the nearest integer BPM", () => {
    // ~ 480ms avg → 125 BPM
    expect(bpmFromTaps([0, 480, 960])).toBe(125);
  });

  it("clamps absurd intervals into range", () => {
    expect(bpmFromTaps([0, 10])).toBe(MAX_BPM); // 6000 bpm → clamp
    expect(bpmFromTaps([0, 5000])).toBe(MIN_BPM); // 12 bpm → clamp
  });
});

describe("clampBpm", () => {
  it("clamps and rounds", () => {
    expect(clampBpm(99.6)).toBe(100);
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(999)).toBe(MAX_BPM);
  });
});
