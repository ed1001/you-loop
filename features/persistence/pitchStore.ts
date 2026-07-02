import type { StorageArea } from "./loopStore";
import { clampCents, clampSemitones } from "../pitch/pitchScrub";

export const PITCH_ENABLED_KEY = "you-loop:pitch";
// fallow-ignore-next-line unused-export
export const PITCH_KEY_PREFIX = "you-loop:pitch:v:";

export type PitchSettings = {
  semitones: number;
  cents: number;
};

export const DEFAULT_PITCH_SETTINGS: PitchSettings = { semitones: 0, cents: 0 };

export function pitchKeyFor(videoId: string): string {
  return PITCH_KEY_PREFIX + videoId;
}

function resolveArea(area?: StorageArea): StorageArea {
  return area ?? (browser.storage.local as unknown as StorageArea);
}

export async function getPitchEnabled(area?: StorageArea): Promise<boolean> {
  try {
    const r = await resolveArea(area).get(PITCH_ENABLED_KEY);
    return r[PITCH_ENABLED_KEY] === true;
  } catch {
    return false;
  }
}

export async function setPitchEnabled(
  value: boolean,
  area?: StorageArea
): Promise<void> {
  try {
    await resolveArea(area).set({ [PITCH_ENABLED_KEY]: value });
  } catch {
    // Best-effort: a failed write leaves the prior value intact.
  }
}

export async function loadPitchSettings(
  videoId: string,
  area?: StorageArea
): Promise<PitchSettings> {
  const key = pitchKeyFor(videoId);
  try {
    const r = await resolveArea(area).get(key);
    const raw = r[key];
    if (raw == null || typeof raw !== "object") return DEFAULT_PITCH_SETTINGS;
    const merged = { ...DEFAULT_PITCH_SETTINGS, ...(raw as Partial<PitchSettings>) };
    return {
      semitones: clampSemitones(merged.semitones),
      cents: clampCents(merged.cents)
    };
  } catch {
    return DEFAULT_PITCH_SETTINGS;
  }
}

export async function savePitchSettings(
  videoId: string,
  settings: PitchSettings,
  area?: StorageArea
): Promise<void> {
  try {
    await resolveArea(area).set({ [pitchKeyFor(videoId)]: settings });
  } catch {
    // Best-effort.
  }
}
