import { describe, expect, it } from "vitest";
import type { StorageArea } from "./loopStore";
import {
  COUNT_IN_KEY,
  DEFAULT_COUNT_IN_SETTINGS,
  countInKeyFor,
  getCountInEnabled,
  setCountInEnabled,
  loadCountInSettings,
  saveCountInSettings,
  sanitizeCountInSettings
} from "./countInStore";

function makeArea(
  initial: Record<string, unknown> = {}
): StorageArea & { dump: () => Record<string, unknown> } {
  let data: Record<string, unknown> = { ...initial };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      data = { ...data, ...items };
    },
    dump: () => data
  };
}

describe("countInStore enabled flag", () => {
  it("defaults to off", async () => {
    expect(await getCountInEnabled(makeArea())).toBe(false);
  });

  it("round-trips", async () => {
    const area = makeArea();
    await setCountInEnabled(true, area);
    expect(await getCountInEnabled(area)).toBe(true);
  });

  it("treats a malformed value as off", async () => {
    expect(await getCountInEnabled(makeArea({ [COUNT_IN_KEY]: "x" }))).toBe(false);
  });
});

describe("countInStore per-video settings", () => {
  it("returns defaults when absent", async () => {
    expect(await loadCountInSettings("abc", makeArea())).toEqual(
      DEFAULT_COUNT_IN_SETTINGS
    );
  });

  it("round-trips per video and shards by id", async () => {
    const area = makeArea();
    await saveCountInSettings(
      "abc",
      { bpm: 90, beatsPerBar: 3, noteValue: 4, bars: 2 },
      area
    );
    expect(area.dump()[countInKeyFor("abc")]).toBeDefined();
    expect(await loadCountInSettings("abc", area)).toEqual({
      bpm: 90,
      beatsPerBar: 3,
      noteValue: 4,
      bars: 2
    });
    // a different video is untouched
    expect(await loadCountInSettings("xyz", area)).toEqual(
      DEFAULT_COUNT_IN_SETTINGS
    );
  });

  it("backfills missing fields from defaults", async () => {
    const area = makeArea({ [countInKeyFor("abc")]: { bpm: 80 } });
    expect(await loadCountInSettings("abc", area)).toEqual({
      ...DEFAULT_COUNT_IN_SETTINGS,
      bpm: 80
    });
  });

  it("replaces non-finite stored values with defaults", async () => {
    // A corrupt bpm reaching buildCountOff turns 60/bpm into NaN/Infinity beat
    // timing, so the store must never surface one.
    const area = makeArea({
      [countInKeyFor("abc")]: {
        bpm: NaN,
        beatsPerBar: Infinity,
        noteValue: "x",
        bars: null
      }
    });
    expect(await loadCountInSettings("abc", area)).toEqual(
      DEFAULT_COUNT_IN_SETTINGS
    );
  });

  it("clamps finite out-of-range stored values into range", async () => {
    const area = makeArea({
      [countInKeyFor("abc")]: { bpm: 0, beatsPerBar: -3, noteValue: 64, bars: 99 }
    });
    expect(await loadCountInSettings("abc", area)).toEqual({
      bpm: 40, // MIN_BPM
      beatsPerBar: 1,
      noteValue: 16,
      bars: 4
    });
  });

  it("sanitizeCountInSettings guards arbitrary input", () => {
    expect(sanitizeCountInSettings(null)).toEqual(DEFAULT_COUNT_IN_SETTINGS);
    expect(sanitizeCountInSettings({ bpm: 0, beatsPerBar: 99 })).toEqual({
      ...DEFAULT_COUNT_IN_SETTINGS,
      bpm: 40,
      beatsPerBar: 12
    });
  });
});
