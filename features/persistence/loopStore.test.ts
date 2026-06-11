import { describe, expect, it } from "vitest";
import type { StorageArea, SavedStore } from "./loopStore";
import {
  SAVED_STORE_KEY,
  addLoop,
  loadEntry,
  renameLoop,
  removeLoop,
  setLastUsed
} from "./loopStore";

// In-memory stub of the browser.storage.local area.
function makeArea(
  initial: SavedStore = {}
): StorageArea & { dump: () => SavedStore } {
  let data: Record<string, unknown> = {
    [SAVED_STORE_KEY]: structuredClone(initial)
  };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      data = { ...data, ...items };
    },
    dump: () => (data[SAVED_STORE_KEY] as SavedStore) ?? {}
  };
}

const seg = (start: number, end: number) => ({ start, end });

// Seed two loops "A" and "B" on video "v" with increasing lastSeen.
async function seedTwo(area: StorageArea) {
  const a = await addLoop("v", "A", seg(1, 2), null, area, 10);
  const b = await addLoop("v", "B", seg(3, 4), null, area, 20);
  return { a, b };
}

describe("loopStore", () => {
  it("adds a loop and reads it back", async () => {
    const area = makeArea();
    const loop = await addLoop("vid1", "Verse", seg(1, 2), null, area, 1000);

    expect(loop.id).toBeTruthy();
    const entry = await loadEntry("vid1", area, 1000);
    expect(entry?.loops).toHaveLength(1);
    expect(entry?.loops[0].name).toBe("Verse");
    expect(entry?.loops[0].main).toEqual(seg(1, 2));
    expect(entry?.lastUsedId).toBe(loop.id);
  });

  it("returns null for an unknown video", async () => {
    const area = makeArea();
    expect(await loadEntry("nope", area, 1000)).toBeNull();
  });

  it("renames a loop", async () => {
    const area = makeArea();
    const loop = await addLoop("v", "Old", seg(1, 2), null, area, 10);
    await renameLoop("v", loop.id, "New", area, 20);
    const entry = await loadEntry("v", area, 30);
    expect(entry?.loops[0].name).toBe("New");
  });

  it("removes a loop, deleting the entry when the last one goes", async () => {
    const area = makeArea();
    const { a, b } = await seedTwo(area);
    await removeLoop("v", a.id, area, 30);
    const entry = await loadEntry("v", area, 40);
    expect(entry?.loops.map((l) => l.id)).toEqual([b.id]);

    await removeLoop("v", b.id, area, 50);
    expect(await loadEntry("v", area, 60)).toBeNull();
  });

  it("clears lastUsedId when the last-used loop is removed", async () => {
    const area = makeArea();
    const { a } = await seedTwo(area);
    await setLastUsed("v", a.id, area, 25);
    await removeLoop("v", a.id, area, 30);
    const entry = await loadEntry("v", area, 40);
    expect(entry?.lastUsedId).toBeNull();
  });
});
