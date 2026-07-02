import type { StorageArea } from "./loopStore";
import { MIN_BPM, MAX_BPM } from "../playback/tapTempo";

export const COUNT_IN_KEY = "you-loop:count-in";
// fallow-ignore-next-line unused-export
export const COUNTIN_KEY_PREFIX = "you-loop:countin:v:";

export type CountInSettings = {
  bpm: number;
  beatsPerBar: number;
  noteValue: number;
  bars: number;
};

export const DEFAULT_COUNT_IN_SETTINGS: CountInSettings = {
  bpm: 100,
  beatsPerBar: 4,
  noteValue: 4,
  bars: 1
};

export function countInKeyFor(videoId: string): string {
  return COUNTIN_KEY_PREFIX + videoId;
}

function resolveArea(area?: StorageArea): StorageArea {
  return area ?? (browser.storage.local as unknown as StorageArea);
}

export async function getCountInEnabled(area?: StorageArea): Promise<boolean> {
  try {
    const r = await resolveArea(area).get(COUNT_IN_KEY);
    return r[COUNT_IN_KEY] === true;
  } catch {
    return false;
  }
}

export async function setCountInEnabled(
  value: boolean,
  area?: StorageArea
): Promise<void> {
  try {
    await resolveArea(area).set({ [COUNT_IN_KEY]: value });
  } catch {
    // Best-effort: a failed write leaves the prior value intact.
  }
}

// Stored numbers can be corrupt (a bad sync write, another device on an older
// version). A non-finite bpm reaching buildCountOff turns 60/bpm into
// NaN/Infinity beat timing, so sanitize at this boundary: finite values clamp
// into range, anything else falls back to the field's default.
function intInRange(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export async function loadCountInSettings(
  videoId: string,
  area?: StorageArea
): Promise<CountInSettings> {
  const key = countInKeyFor(videoId);
  try {
    const r = await resolveArea(area).get(key);
    const raw = r[key];
    if (raw == null || typeof raw !== "object") return DEFAULT_COUNT_IN_SETTINGS;
    const merged = { ...DEFAULT_COUNT_IN_SETTINGS, ...(raw as Partial<CountInSettings>) };
    const d = DEFAULT_COUNT_IN_SETTINGS;
    return {
      bpm: intInRange(merged.bpm, MIN_BPM, MAX_BPM, d.bpm),
      beatsPerBar: intInRange(merged.beatsPerBar, 1, 12, d.beatsPerBar),
      noteValue: intInRange(merged.noteValue, 1, 16, d.noteValue),
      bars: intInRange(merged.bars, 1, 4, d.bars)
    };
  } catch {
    return DEFAULT_COUNT_IN_SETTINGS;
  }
}

export async function saveCountInSettings(
  videoId: string,
  settings: CountInSettings,
  area?: StorageArea
): Promise<void> {
  try {
    await resolveArea(area).set({ [countInKeyFor(videoId)]: settings });
  } catch {
    // Best-effort.
  }
}
