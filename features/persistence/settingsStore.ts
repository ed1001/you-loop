import type { StorageArea } from "./loopStore";

export const ENABLED_KEY = "you-loop:enabled";
export const LAUNCH_KEY = "you-loop:launch";
// A launch handoff older than this is stale — the tab never arrived (e.g. the
// popup opened the tab but YouTube errored) and must not fire on a later visit.
// fallow-ignore-next-line unused-export
export const LAUNCH_TTL_MS = 30_000;

// fallow-ignore-next-line unused-type
export type LaunchRequest = { videoId: string; ts: number };

// Shape of browser.storage.onChanged, narrowed to what we use and injectable
// for tests (the real event object is unavailable under vitest).
export type StorageChanges = Record<string, { newValue?: unknown }>;
export type ChangeEvents = {
  addListener(cb: (changes: StorageChanges, areaName: string) => void): void;
  removeListener(cb: (changes: StorageChanges, areaName: string) => void): void;
};

function resolveArea(area?: StorageArea): StorageArea {
  if (area) return area;
  return browser.storage.local as unknown as StorageArea;
}

// Absent or malformed key means enabled: the extension is on by default and
// must never lock itself off because of a bad read.
export async function getEnabled(area?: StorageArea): Promise<boolean> {
  try {
    const result = await resolveArea(area).get(ENABLED_KEY);
    const value = result[ENABLED_KEY];
    return typeof value === "boolean" ? value : true;
  } catch {
    return true;
  }
}

export async function setEnabled(
  value: boolean,
  area?: StorageArea
): Promise<void> {
  try {
    await resolveArea(area).set({ [ENABLED_KEY]: value });
  } catch {
    // Best-effort: a failed write leaves the prior value intact.
  }
}

export function watchEnabled(
  cb: (enabled: boolean) => void,
  events?: ChangeEvents
): () => void {
  const source =
    events ?? (browser.storage.onChanged as unknown as ChangeEvents);
  const listener = (changes: StorageChanges, areaName: string) => {
    if (areaName !== "local") return;
    const change = changes[ENABLED_KEY];
    if (change == null) return;
    cb(typeof change.newValue === "boolean" ? change.newValue : true);
  };
  source.addListener(listener);
  return () => source.removeListener(listener);
}

export async function requestLaunch(
  videoId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  try {
    await resolveArea(area).set({
      [LAUNCH_KEY]: { videoId, ts: now } satisfies LaunchRequest
    });
  } catch {
    // Best-effort: without the handoff the video still opens, just panel-off.
  }
}

// One-shot consume: reads and clears the pending launch. True only when it
// targets `videoId` and is fresh. Always clears — a stale or mismatched
// request must not fire later.
export async function takeLaunch(
  videoId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<boolean> {
  try {
    const a = resolveArea(area);
    const result = await a.get(LAUNCH_KEY);
    const raw = result[LAUNCH_KEY] as LaunchRequest | null | undefined;
    if (raw == null) return false;
    await a.set({ [LAUNCH_KEY]: null });
    return raw.videoId === videoId && now - raw.ts < LAUNCH_TTL_MS;
  } catch {
    return false;
  }
}
