import { describe, expect, it } from "vitest";
import type { StorageArea } from "./loopStore";
import {
  DEFAULT_PITCH_SETTINGS,
  loadPitchSettings,
  pitchKeyFor,
  savePitchSettings
} from "./pitchStore";

function memArea(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const area: StorageArea = {
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }
  };
  return { area, data };
}

const throwingArea: StorageArea = {
  get: async () => {
    throw new Error("boom");
  },
  set: async () => {
    throw new Error("boom");
  }
};

describe("loadPitchSettings", () => {
  it("returns defaults when nothing is stored", async () => {
    const { area } = memArea();
    expect(await loadPitchSettings("vid", area)).toEqual(DEFAULT_PITCH_SETTINGS);
  });

  it("merges a partial record over defaults", async () => {
    const { area } = memArea({ [pitchKeyFor("vid")]: { semitones: 3 } });
    expect(await loadPitchSettings("vid", area)).toEqual({ semitones: 3, cents: 0 });
  });

  it("clamps out-of-range stored values", async () => {
    const { area } = memArea({ [pitchKeyFor("vid")]: { semitones: 99, cents: -200 } });
    expect(await loadPitchSettings("vid", area)).toEqual({ semitones: 12, cents: -50 });
  });

  it("falls back to defaults when the area throws", async () => {
    expect(await loadPitchSettings("vid", throwingArea)).toEqual(DEFAULT_PITCH_SETTINGS);
  });
});

describe("savePitchSettings", () => {
  it("writes under the per-video key", async () => {
    const { area, data } = memArea();
    await savePitchSettings("vid", { semitones: -2, cents: 10 }, area);
    expect(data[pitchKeyFor("vid")]).toEqual({ semitones: -2, cents: 10 });
  });

  it("does not throw when the area throws", async () => {
    await expect(
      savePitchSettings("vid", { semitones: 1, cents: 0 }, throwingArea)
    ).resolves.toBeUndefined();
  });
});
