import { describe, expect, it, vi } from "vitest";
import type { StorageArea } from "./loopStore";
import {
  ENABLED_KEY,
  LAUNCH_KEY,
  getEnabled,
  setEnabled,
  watchEnabled,
  requestLaunch,
  takeLaunch,
  type StorageChanges,
  type ChangeEvents
} from "./settingsStore";

// In-memory stub of browser.storage.local, same shape as loopStore's tests.
// fallow-ignore-next-line code-duplication
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

describe("settingsStore enabled flag", () => {
  it("defaults to enabled when the key is absent", async () => {
    expect(await getEnabled(makeArea())).toBe(true);
  });

  it("round-trips set/get", async () => {
    const area = makeArea();
    await setEnabled(false, area);
    expect(await getEnabled(area)).toBe(false);
    await setEnabled(true, area);
    expect(await getEnabled(area)).toBe(true);
  });

  it("treats a malformed stored value as enabled", async () => {
    expect(await getEnabled(makeArea({ [ENABLED_KEY]: "nope" }))).toBe(true);
  });
});

describe("settingsStore watchEnabled", () => {
  function makeEvents() {
    const listeners = new Set<(c: StorageChanges, a: string) => void>();
    const events: ChangeEvents = {
      addListener: (cb) => listeners.add(cb),
      removeListener: (cb) => listeners.delete(cb)
    };
    return {
      events,
      fire: (changes: StorageChanges, areaName: string) =>
        listeners.forEach((cb) => cb(changes, areaName)),
      count: () => listeners.size
    };
  }

  it("fires on enabled-key changes in the local area only", () => {
    const { events, fire } = makeEvents();
    const cb = vi.fn();
    watchEnabled(cb, events);

    fire({ [ENABLED_KEY]: { newValue: false } }, "local");
    expect(cb).toHaveBeenCalledWith(false);

    fire({ [ENABLED_KEY]: { newValue: true } }, "sync");
    fire({ "other-key": { newValue: 1 } }, "local");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("treats a removed key as enabled and unsubscribes cleanly", () => {
    const { events, fire, count } = makeEvents();
    const cb = vi.fn();
    const stop = watchEnabled(cb, events);

    fire({ [ENABLED_KEY]: {} }, "local");
    expect(cb).toHaveBeenCalledWith(true);

    stop();
    expect(count()).toBe(0);
  });
});

describe("settingsStore launch handoff", () => {
  it("takes a fresh matching launch exactly once", async () => {
    const area = makeArea();
    await requestLaunch("vid1", area, 1_000);
    expect(await takeLaunch("vid1", area, 2_000)).toBe(true);
    // One-shot: a second take finds nothing.
    expect(await takeLaunch("vid1", area, 2_000)).toBe(false);
  });

  it("ignores and clears a mismatched videoId", async () => {
    const area = makeArea();
    await requestLaunch("vid1", area, 1_000);
    expect(await takeLaunch("other", area, 2_000)).toBe(false);
    expect(area.dump()[LAUNCH_KEY]).toBeNull();
  });

  it("ignores and clears a stale request", async () => {
    const area = makeArea();
    await requestLaunch("vid1", area, 1_000);
    expect(await takeLaunch("vid1", area, 1_000 + 31_000)).toBe(false);
    expect(area.dump()[LAUNCH_KEY]).toBeNull();
  });
});
