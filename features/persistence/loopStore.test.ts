import { describe, expect, it } from "vitest";
import type { StorageArea, SavedStore } from "./loopStore";
import {
  SAVED_STORE_KEY,
  addLoop,
  listEntries,
  loadEntry,
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

  it("backfills the title on load, without clobbering it on a later titleless visit", async () => {
    const area = makeArea();
    await addLoop("v", "A", seg(1, 2), null, area, 10);

    const titled = await loadEntry("v", area, 20, "My Song");
    expect(titled?.title).toBe("My Song");

    // A later visit that can't read a title leaves the stored one intact.
    const untouched = await loadEntry("v", area, 30);
    expect(untouched?.title).toBe("My Song");
  });

  it("lists saved videos, most-recently-seen first, with loop counts", async () => {
    const area = makeArea();
    await addLoop("old", "A", seg(1, 2), null, area, 100);
    await addLoop("new", "A", seg(1, 2), null, area, 200);
    await addLoop("new", "B", seg(3, 4), null, area, 210);
    await loadEntry("old", area, 100, "Old Video");

    const list = await listEntries(area);
    expect(list.map((v) => v.videoId)).toEqual(["new", "old"]);
    expect(list[0]).toMatchObject({ videoId: "new", count: 2 });
    expect(list[1]).toMatchObject({ videoId: "old", count: 1, title: "Old Video" });
  });
});
