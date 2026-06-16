import { describe, expect, it } from "vitest";
import type { SyncArea, VideoEntry } from "./loopStore";
import { SAVED_STORE_KEY, keyFor } from "./loopStore";
import { MIGRATED_KEY, migrateToSync } from "./migrate";

function makeArea(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    async get(key: string | null) {
      if (key === null) return Object.fromEntries(data);
      return data.has(key) ? { [key]: data.get(key) } : {};
    },
    async set(items: Record<string, unknown>) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(key: string) {
      data.delete(key);
    },
    has: (key: string) => data.has(key),
    get raw() {
      return data;
    }
  };
}

const legacyBlob = {
  [SAVED_STORE_KEY]: {
    vid1: { loops: [{ id: "l1", name: "A", main: { start: 1, end: 2 }, zoom: null }], lastUsedId: "l1", lastSeen: 500, title: "One" },
    vid2: { loops: [{ id: "l2", name: "B", main: { start: 3, end: 4 }, zoom: null }], lastUsedId: "l2", lastSeen: 900 }
  }
};

describe("migrateToSync", () => {
  it("copies each video to a per-video sync key, seeding addedAt from lastSeen", async () => {
    const local = makeArea(legacyBlob);
    const sync = makeArea();
    await migrateToSync({ sync, local }, 1234);

    const e1 = (await sync.get(keyFor("vid1")))[keyFor("vid1")] as VideoEntry;
    expect(e1.loops[0].id).toBe("l1");
    expect(e1.addedAt).toBe(500);
    expect(e1.title).toBe("One");
    expect("lastSeen" in e1).toBe(false);

    const e2 = (await sync.get(keyFor("vid2")))[keyFor("vid2")] as VideoEntry;
    expect(e2.addedAt).toBe(900);
    expect(e2.title).toBeUndefined();

    expect(local.has(MIGRATED_KEY)).toBe(true);
  });

  it("is idempotent: a second run does nothing", async () => {
    const local = makeArea(legacyBlob);
    const sync = makeArea();
    await migrateToSync({ sync, local }, 1234);
    // Mutate a synced entry, then re-run: it must not be overwritten.
    await sync.set({ [keyFor("vid1")]: { loops: [], lastUsedId: null, addedAt: 7 } });
    await migrateToSync({ sync, local }, 9999);
    const e1 = (await sync.get(keyFor("vid1")))[keyFor("vid1")] as VideoEntry;
    expect(e1.addedAt).toBe(7);
  });

  it("sets the guard and writes nothing on a fresh install", async () => {
    const local = makeArea();
    const sync = makeArea();
    await migrateToSync({ sync, local }, 1234);
    expect(local.has(MIGRATED_KEY)).toBe(true);
    expect([...sync.raw.keys()]).toHaveLength(0);
  });

  it("leaves the guard unset when a sync write fails, so it retries", async () => {
    const local = makeArea(legacyBlob);
    const sync = {
      ...makeArea(),
      async set() {
        throw new Error("QUOTA_BYTES quota exceeded");
      }
    } as unknown as SyncArea;
    await migrateToSync({ sync, local }, 1234);
    expect(local.has(MIGRATED_KEY)).toBe(false);
  });

  it("does not migrate twice when the guard is already set", async () => {
    const local = makeArea({ ...legacyBlob, [MIGRATED_KEY]: true });
    const sync = makeArea();
    await migrateToSync({ sync, local }, 1234);
    expect([...sync.raw.keys()]).toHaveLength(0);
  });
});
