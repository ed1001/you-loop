import { describe, expect, it } from "vitest";
import type { SyncArea, VideoEntry } from "./loopStore";
import {
  SAVED_KEY_PREFIX,
  keyFor,
  addLoop,
  listEntries,
  loadEntry,
  removeLoop,
  removeVideo,
  setLastUsed,
  updateLoop
} from "./loopStore";
import { makeMemoryArea } from "./memoryArea.testutil";
import { DEFAULT_COUNT_IN_SETTINGS } from "./countInStore";

// makeMemoryArea plus the key/entry accessors this suite asserts on.
function makeArea(opts: { failSetsAfter?: number } = {}) {
  const a = makeMemoryArea({}, opts);
  return Object.assign(a, {
    keys: () => [...a.data.keys()],
    raw: (videoId: string) => a.data.get(keyFor(videoId)) as VideoEntry | undefined
  });
}

type FakeArea = ReturnType<typeof makeArea>;
const sync = (a: FakeArea) => ({ sync: a, local: a } as { sync: SyncArea; local: SyncArea });
const seg = (start: number, end: number) => ({ start, end });

async function seedTwo(store: { sync: SyncArea; local: SyncArea }) {
  const a = await addLoop("v", "A", seg(1, 2), null, null, store, 10);
  const b = await addLoop("v", "B", seg(3, 4), null, null, store, 20);
  return { a, b };
}

describe("loopStore", () => {
  it("adds a loop and reads it back", async () => {
    const area = makeArea();
    const loop = await addLoop("vid1", "Verse", seg(1, 2), null, null, sync(area), 1000);

    expect(loop.id).toBeTruthy();
    const entry = await loadEntry("vid1", sync(area));
    expect(entry?.loops).toHaveLength(1);
    expect(entry?.loops[0].name).toBe("Verse");
    expect(entry?.loops[0].main).toEqual(seg(1, 2));
    expect(entry?.lastUsedId).toBe(loop.id);
    expect(entry?.addedAt).toBe(1000);
  });

  it("stamps addedAt once and keeps it across later edits", async () => {
    const area = makeArea();
    await addLoop("v", "A", seg(1, 2), null, null, sync(area), 100);
    await addLoop("v", "B", seg(3, 4), null, null, sync(area), 200);
    expect(area.raw("v")?.addedAt).toBe(100);
  });

  it("returns null for an unknown video", async () => {
    const area = makeArea();
    expect(await loadEntry("nope", sync(area))).toBeNull();
  });

  it("removes a loop, deleting the entry when the last one goes", async () => {
    const area = makeArea();
    const { a, b } = await seedTwo(sync(area));
    await removeLoop("v", a.id, sync(area));
    const entry = await loadEntry("v", sync(area));
    expect(entry?.loops.map((l) => l.id)).toEqual([b.id]);

    await removeLoop("v", b.id, sync(area));
    expect(await loadEntry("v", sync(area))).toBeNull();
    expect(area.keys()).not.toContain(keyFor("v"));
  });

  it("clears lastUsedId when the last-used loop is removed", async () => {
    const area = makeArea();
    const { a } = await seedTwo(sync(area));
    await setLastUsed("v", a.id, sync(area));
    await removeLoop("v", a.id, sync(area));
    const entry = await loadEntry("v", sync(area));
    expect(entry?.lastUsedId).toBeNull();
  });

  it("backfills the title on load only when it changed", async () => {
    const area = makeArea();
    await addLoop("v", "A", seg(1, 2), null, null, sync(area), 10);

    const titled = await loadEntry("v", sync(area), "My Song");
    expect(titled?.title).toBe("My Song");

    // A later visit with no title leaves the stored one intact.
    const untouched = await loadEntry("v", sync(area));
    expect(untouched?.title).toBe("My Song");
  });

  it("lists saved videos newest-added first, with loop counts", async () => {
    const area = makeArea();
    await addLoop("old", "A", seg(1, 2), null, null, sync(area), 100);
    await addLoop("new", "A", seg(1, 2), null, null, sync(area), 200);
    await addLoop("new", "B", seg(3, 4), null, null, sync(area), 210);
    await loadEntry("old", sync(area), "Old Video");

    const list = await listEntries(sync(area));
    expect(list.map((v) => v.videoId)).toEqual(["new", "old"]);
    expect(list[0]).toMatchObject({ videoId: "new", count: 2 });
    expect(list[1]).toMatchObject({ videoId: "old", count: 1, title: "Old Video" });
  });

  it("removes a video and all its loops", async () => {
    const area = makeArea();
    await seedTwo(sync(area));
    await addLoop("w", "C", seg(5, 6), null, null, sync(area), 30);

    await removeVideo("v", sync(area));

    expect(area.keys()).not.toContain(keyFor("v"));
    expect(area.keys()).toContain(keyFor("w"));
  });

  it("removeVideo is a no-op on an unknown id", async () => {
    const area = makeArea();
    await seedTwo(sync(area));
    await removeVideo("unknown", sync(area));
    expect(area.keys()).toEqual([keyFor("v")]);
  });

  it("falls back to local when a sync write fails, and merges on read", async () => {
    const syncArea = makeArea({ failSetsAfter: 0 }); // every sync set throws
    const localArea = makeArea();
    const store = { sync: syncArea, local: localArea };

    const loop = await addLoop("v", "A", seg(1, 2), null, null, store, 10);
    // Sync never stored it; local did.
    expect(syncArea.raw("v")).toBeUndefined();
    expect(localArea.raw("v")?.loops[0].id).toBe(loop.id);

    // Reads merge both areas.
    const entry = await loadEntry("v", store);
    expect(entry?.loops[0].id).toBe(loop.id);
    const list = await listEntries(store);
    expect(list.map((v) => v.videoId)).toEqual(["v"]);
  });

  it("prefers the sync copy over a stale local copy on read", async () => {
    const syncArea = makeArea();
    const localArea = makeArea();
    const store = { sync: syncArea, local: localArea };
    // Stale local-only copy under the same key.
    await localArea.set({ [keyFor("v")]: { loops: [], lastUsedId: null, addedAt: 1 } });
    await addLoop("v", "Fresh", seg(1, 2), null, null, store, 50);

    const entry = await loadEntry("v", store);
    expect(entry?.loops[0]?.name).toBe("Fresh");
  });

  it("addLoop stores a count-in snapshot and loadEntry returns it sanitized", async () => {
    const area = makeArea();
    const snap = { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 };
    const loop = await addLoop("v1", "solo", seg(1, 2), null, snap, sync(area));
    expect(loop.countIn).toEqual(snap);

    // Corrupt it in place, then read back: sanitized.
    const dump = area.dump();
    (dump[keyFor("v1")] as VideoEntry).loops[0].countIn = { bpm: NaN } as never;
    const entry = await loadEntry("v1", sync(area));
    expect(entry!.loops[0].countIn).toEqual(DEFAULT_COUNT_IN_SETTINGS);
  });

  it("updateLoop overwrites main/zoom/countIn in place", async () => {
    const area = makeArea();
    const loop = await addLoop("v1", "riff", seg(1, 2), null, null, sync(area));
    const updated = await updateLoop(
      "v1",
      loop.id,
      {
        main: seg(3, 5),
        zoom: seg(3.5, 4),
        countIn: { bpm: 90, beatsPerBar: 3, noteValue: 4, bars: 2 }
      },
      sync(area)
    );
    expect(updated?.main).toEqual(seg(3, 5));
    const entry = await loadEntry("v1", sync(area));
    expect(entry!.loops[0].countIn?.bpm).toBe(90);
    expect(entry!.loops[0].name).toBe("riff"); // name untouched
  });

  it("updateLoop on a vanished id is a null no-op", async () => {
    const area = makeArea();
    await addLoop("v1", "riff", seg(1, 2), null, null, sync(area));
    expect(
      await updateLoop("v1", "nope", { main: seg(0, 1), zoom: null, countIn: null }, sync(area))
    ).toBeNull();
  });
});
