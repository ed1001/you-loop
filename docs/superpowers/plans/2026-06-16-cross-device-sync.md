# Cross-Device Sync for Saved Loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move saved loops from `browser.storage.local` to `browser.storage.sync` with per-video keys, so loops follow a user's browser profile across devices.

**Architecture:** Shard the single saved-loops blob into one key per video (`you-loop:saved:v:<videoId>`) stored in `storage.sync`. Conflicts resolve last-write-wins per key. A `lastSeen` recency field is dropped in favor of a write-once `addedAt` for stable cross-device ordering. A one-time background migration moves existing local data to sync; individual sync writes that fail (quota/size) fall back to `storage.local`, and reads merge both areas.

**Tech Stack:** TypeScript, WXT (WebExtension), React 19, Vitest, jsdom.

Design spec: `docs/superpowers/specs/2026-06-16-cross-device-sync-design.md`

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `features/persistence/loopStore.ts` | Saved-loops CRUD; per-video sync keys + local fallback | Rewrite internals, change types & signatures |
| `features/persistence/loopStore.test.ts` | Unit tests for the store | Rewrite stub + tests |
| `features/persistence/migrate.ts` | One-time local→sync migration | Create |
| `features/persistence/migrate.test.ts` | Migration tests | Create |
| `entrypoints/background.ts` | Runs migration on startup | Add one call |
| `entrypoints/content/pageUi.tsx` | Content-script call sites | Fix `loadEntry` argument shift |
| `entrypoints/popup/App.tsx` | Popup call sites | Wrap single `area` seam into `{sync,local}` |
| `entrypoints/popup/App.test.tsx` | Popup tests | Update seed shape if it seeds loops |

No manifest change: the existing `permissions: ["storage"]` already grants `storage.sync` (the `storage` permission covers `local`, `sync`, `session`, and `managed`).

---

## Task 1: New types, key helpers, and storage resolver

Introduces the per-video storage model without touching behavior yet. `StorageArea` (used by `settingsStore.ts`) is left untouched for compatibility; a new `SyncArea`/`LoopStorage` pair is added for the loop store.

**Files:**
- Modify: `features/persistence/loopStore.ts`

- [ ] **Step 1: Replace the type block and storage resolver at the top of `loopStore.ts`**

Replace lines 1–41 (the imports, `SAVED_STORE_KEY`, `SavedLoop`, `VideoEntry`, `SavedStore`, `SavedVideo`, `StorageArea`, `resolveArea`) with:

```ts
import type { LoopSegment } from "../playback/types";

// Legacy single-blob key (storage.local). Read only by the migration.
export const SAVED_STORE_KEY = "you-loop:saved";

// Per-video key prefix in storage.sync: `you-loop:saved:v:<videoId>`.
export const SAVED_KEY_PREFIX = "you-loop:saved:v:";

export function keyFor(videoId: string): string {
  return SAVED_KEY_PREFIX + videoId;
}

export type SavedLoop = {
  id: string;
  name: string;
  main: LoopSegment;
  zoom: LoopSegment | null;
};

export type VideoEntry = {
  loops: SavedLoop[];
  lastUsedId: string | null;
  // Set once when the entry is first created; never updated. Drives the
  // cross-video list order (sharded+synced data has no reliable insertion
  // order, so an explicit field is required for a stable cross-device sort).
  addedAt: number;
  // Captured on visit. Optional: entries that never had a title (or where
  // capture failed) lack it, and the cross-video list falls back to the id.
  title?: string;
};

// Legacy single-blob store shape. Used only by the migration.
export type SavedStore = Record<string, VideoEntry>;

// A one-line summary of a saved video, for the cross-video index.
export type SavedVideo = {
  videoId: string;
  title?: string;
  count: number;
  addedAt: number;
};

// Kept for settingsStore.ts, which imports this and uses only get/set.
export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

// The loop store needs all-keys reads (get(null)) and key deletion.
export type SyncArea = {
  get(key: string | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

// Primary (sync) plus fallback (local) areas. Writes try sync, fall back to
// local; reads merge both with sync winning.
export type LoopStorage = { sync: SyncArea; local: SyncArea };

export function resolveStorage(storage?: Partial<LoopStorage>): LoopStorage {
  return {
    sync: storage?.sync ?? (browser.storage.sync as unknown as SyncArea),
    local: storage?.local ?? (browser.storage.local as unknown as SyncArea)
  };
}
```

- [ ] **Step 2: Verify it compiles (rest of file still references old helpers; expect errors only there)**

Run: `npm run typecheck`
Expected: Errors only in `loopStore.ts` for the now-removed `resolveArea`/`readStore`/`writeStore` and `lastSeen` — these are fixed in Task 2. No errors in `settingsStore.ts`.

(Do not commit yet — the file is mid-rewrite. Task 2 completes it.)

---

## Task 2: Rewrite store internals and CRUD for per-video keys + fallback

Replaces the whole-blob read/write with per-key access, adds the local fallback and merged read, and updates every public function. Tests are rewritten in the same task since the storage shape and signatures change.

**Files:**
- Modify: `features/persistence/loopStore.ts` (lines after the type block — the old `readStore` through `setLastUsed`)
- Rewrite: `features/persistence/loopStore.test.ts`

- [ ] **Step 1: Rewrite the test file `loopStore.test.ts` entirely**

```ts
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
  setLastUsed
} from "./loopStore";

// In-memory SyncArea. get(null) returns every key. Optionally throws on set
// after `failSetsAfter` successful sets, to exercise the local fallback.
function makeArea(opts: { failSetsAfter?: number } = {}) {
  const data = new Map<string, unknown>();
  let sets = 0;
  return {
    async get(key: string | null) {
      if (key === null) return Object.fromEntries(data);
      return data.has(key) ? { [key]: data.get(key) } : {};
    },
    async set(items: Record<string, unknown>) {
      if (opts.failSetsAfter != null && sets >= opts.failSetsAfter) {
        sets++;
        throw new Error("QUOTA_BYTES quota exceeded");
      }
      sets++;
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(key: string) {
      data.delete(key);
    },
    keys: () => [...data.keys()],
    raw: (videoId: string) => data.get(keyFor(videoId)) as VideoEntry | undefined
  };
}

type FakeArea = ReturnType<typeof makeArea>;
const sync = (a: FakeArea) => ({ sync: a, local: a } as { sync: SyncArea; local: SyncArea });
const seg = (start: number, end: number) => ({ start, end });

async function seedTwo(store: { sync: SyncArea; local: SyncArea }) {
  const a = await addLoop("v", "A", seg(1, 2), null, store, 10);
  const b = await addLoop("v", "B", seg(3, 4), null, store, 20);
  return { a, b };
}

describe("loopStore", () => {
  it("adds a loop and reads it back", async () => {
    const area = makeArea();
    const loop = await addLoop("vid1", "Verse", seg(1, 2), null, sync(area), 1000);

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
    await addLoop("v", "A", seg(1, 2), null, sync(area), 100);
    await addLoop("v", "B", seg(3, 4), null, sync(area), 200);
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
    await addLoop("v", "A", seg(1, 2), null, sync(area), 10);

    const titled = await loadEntry("v", sync(area), "My Song");
    expect(titled?.title).toBe("My Song");

    // A later visit with no title leaves the stored one intact.
    const untouched = await loadEntry("v", sync(area));
    expect(untouched?.title).toBe("My Song");
  });

  it("lists saved videos newest-added first, with loop counts", async () => {
    const area = makeArea();
    await addLoop("old", "A", seg(1, 2), null, sync(area), 100);
    await addLoop("new", "A", seg(1, 2), null, sync(area), 200);
    await addLoop("new", "B", seg(3, 4), null, sync(area), 210);
    await loadEntry("old", sync(area), "Old Video");

    const list = await listEntries(sync(area));
    expect(list.map((v) => v.videoId)).toEqual(["new", "old"]);
    expect(list[0]).toMatchObject({ videoId: "new", count: 2 });
    expect(list[1]).toMatchObject({ videoId: "old", count: 1, title: "Old Video" });
  });

  it("removes a video and all its loops", async () => {
    const area = makeArea();
    await seedTwo(sync(area));
    await addLoop("w", "C", seg(5, 6), null, sync(area), 30);

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

    const loop = await addLoop("v", "A", seg(1, 2), null, store, 10);
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
    await addLoop("v", "Fresh", seg(1, 2), null, store, 50);

    const entry = await loadEntry("v", store);
    expect(entry?.loops[0]?.name).toBe("Fresh");
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail (store not rewritten yet)**

Run: `npx vitest run features/persistence/loopStore.test.ts`
Expected: FAIL — type errors / `addedAt` undefined / wrong signatures, because the implementation still uses the old blob helpers.

- [ ] **Step 3: Replace the implementation in `loopStore.ts` (everything after the Task 1 type block)**

Replace the old `readStore`/`writeStore`/`loadEntry`/`listEntries`/`addLoop`/`mutateEntry`/`removeLoop`/`removeVideo`/`setLastUsed` with:

```ts
// --- per-video key access (sync primary, local fallback) ---

async function readEntry(
  s: LoopStorage,
  videoId: string
): Promise<VideoEntry | null> {
  const key = keyFor(videoId);
  try {
    const r = await s.sync.get(key);
    if (r[key] != null) return r[key] as VideoEntry;
  } catch {
    // fall through to local
  }
  try {
    const r = await s.local.get(key);
    if (r[key] != null) return r[key] as VideoEntry;
  } catch {
    // give up
  }
  return null;
}

async function writeEntry(
  s: LoopStorage,
  videoId: string,
  entry: VideoEntry
): Promise<void> {
  const key = keyFor(videoId);
  try {
    await s.sync.set({ [key]: entry });
  } catch {
    // Sync write failed (quota / oversized / too many keys): keep it locally
    // so the video still works on this device.
    try {
      await s.local.set({ [key]: entry });
    } catch {
      // Best-effort: a failed write leaves the prior value intact.
    }
  }
}

async function deleteEntry(s: LoopStorage, videoId: string): Promise<void> {
  const key = keyFor(videoId);
  try {
    await s.sync.remove(key);
  } catch {
    // ignore
  }
  try {
    await s.local.remove(key); // drop any fallback copy so it can't resurrect
  } catch {
    // ignore
  }
}

export async function loadEntry(
  videoId: string,
  storage?: Partial<LoopStorage>,
  title?: string
): Promise<VideoEntry | null> {
  const s = resolveStorage(storage);
  const entry = await readEntry(s, videoId);
  if (!entry) return null;
  // Backfill the title only when it actually changed, so normal visits cost
  // no sync write.
  if (title != null && title !== "" && entry.title !== title) {
    entry.title = title;
    await writeEntry(s, videoId, entry);
  }
  return entry;
}

// All saved videos as one-line summaries, newest-added first. Merges sync and
// local per-video keys (sync wins on collision).
export async function listEntries(
  storage?: Partial<LoopStorage>
): Promise<SavedVideo[]> {
  const s = resolveStorage(storage);
  const entries = new Map<string, VideoEntry>();
  for (const area of [s.local, s.sync]) {
    let all: Record<string, unknown> = {};
    try {
      all = await area.get(null);
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(SAVED_KEY_PREFIX) || value == null) continue;
      entries.set(key.slice(SAVED_KEY_PREFIX.length), value as VideoEntry);
    }
  }
  return [...entries.entries()]
    .map(([videoId, entry]) => ({
      videoId,
      title: entry.title,
      count: entry.loops.length,
      addedAt: entry.addedAt
    }))
    .sort((x, y) => y.addedAt - x.addedAt || (x.videoId < y.videoId ? -1 : 1));
}

export async function addLoop(
  videoId: string,
  name: string,
  main: LoopSegment,
  zoom: LoopSegment | null,
  storage?: Partial<LoopStorage>,
  now: number = Date.now()
): Promise<SavedLoop> {
  const s = resolveStorage(storage);
  const existing = await readEntry(s, videoId);
  const loop: SavedLoop = { id: crypto.randomUUID(), name, main, zoom };
  const entry: VideoEntry = existing
    ? { ...existing, loops: [...existing.loops, loop], lastUsedId: loop.id }
    : { loops: [loop], lastUsedId: loop.id, addedAt: now };
  await writeEntry(s, videoId, entry);
  return loop;
}

// Read-modify-write one video's entry. No-op when the video has no entry.
// `apply` mutates the entry in place and may call `ctx.delete()` to remove the
// video (e.g. when its last loop is gone).
async function mutateEntry(
  storage: Partial<LoopStorage> | undefined,
  videoId: string,
  apply: (entry: VideoEntry, ctx: { delete: () => void }) => void
): Promise<void> {
  const s = resolveStorage(storage);
  const entry = await readEntry(s, videoId);
  if (!entry) return;
  let remove = false;
  apply(entry, { delete: () => (remove = true) });
  if (remove) await deleteEntry(s, videoId);
  else await writeEntry(s, videoId, entry);
}

export async function removeLoop(
  videoId: string,
  loopId: string,
  storage?: Partial<LoopStorage>
): Promise<void> {
  await mutateEntry(storage, videoId, (entry, ctx) => {
    entry.loops = entry.loops.filter((l) => l.id !== loopId);
    if (entry.lastUsedId === loopId) entry.lastUsedId = null;
    if (entry.loops.length === 0) ctx.delete();
  });
}

// Drop a video and all its loops. No-op when the video has no entry.
export async function removeVideo(
  videoId: string,
  storage?: Partial<LoopStorage>
): Promise<void> {
  await mutateEntry(storage, videoId, (_entry, ctx) => ctx.delete());
}

export async function setLastUsed(
  videoId: string,
  loopId: string,
  storage?: Partial<LoopStorage>
): Promise<void> {
  await mutateEntry(storage, videoId, (entry) => {
    entry.lastUsedId = loopId;
  });
}
```

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `npx vitest run features/persistence/loopStore.test.ts`
Expected: PASS (all cases, including fallback and sync-wins-on-read).

- [ ] **Step 5: Commit**

```bash
git add features/persistence/loopStore.ts features/persistence/loopStore.test.ts
git commit -m "feat: per-video sync keys for saved loops with local fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migration module (local blob → per-video sync keys)

**Files:**
- Create: `features/persistence/migrate.ts`
- Create: `features/persistence/migrate.test.ts`

- [ ] **Step 1: Write the failing test `migrate.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run features/persistence/migrate.test.ts`
Expected: FAIL with "Cannot find module './migrate'".

- [ ] **Step 3: Implement `migrate.ts`**

```ts
import type { LoopStorage, VideoEntry } from "./loopStore";
import { SAVED_STORE_KEY, keyFor, resolveStorage } from "./loopStore";

// Guard flag (storage.local) marking that the one-time local→sync migration
// has completed.
export const MIGRATED_KEY = "you-loop:sync-migrated";

// Legacy entries carried a `lastSeen`; the new shape uses `addedAt`.
type LegacyEntry = Omit<VideoEntry, "addedAt"> & {
  lastSeen?: number;
  addedAt?: number;
};
type LegacyStore = Record<string, LegacyEntry>;

// Moves the legacy single-blob saved-loops store from storage.local to
// per-video keys in storage.sync. Runs once; safe to call on every startup.
// On any read or write failure it leaves the guard unset so it retries later.
export async function migrateToSync(
  storage?: Partial<LoopStorage>,
  now: number = Date.now()
): Promise<void> {
  const s = resolveStorage(storage);

  let guard: Record<string, unknown> = {};
  try {
    guard = await s.local.get(MIGRATED_KEY);
  } catch {
    return; // can't even read the guard; try again next startup
  }
  if (guard[MIGRATED_KEY]) return;

  let legacy: LegacyStore = {};
  try {
    const r = await s.local.get(SAVED_STORE_KEY);
    legacy = (r[SAVED_STORE_KEY] as LegacyStore) ?? {};
  } catch {
    return;
  }

  const videoIds = Object.keys(legacy);
  if (videoIds.length === 0) {
    try {
      await s.local.set({ [MIGRATED_KEY]: true });
    } catch {
      // ignore
    }
    return;
  }

  try {
    for (const videoId of videoIds) {
      const old = legacy[videoId];
      const entry: VideoEntry = {
        loops: old.loops,
        lastUsedId: old.lastUsedId,
        addedAt: old.lastSeen ?? old.addedAt ?? now,
        ...(old.title != null ? { title: old.title } : {})
      };
      await s.sync.set({ [keyFor(videoId)]: entry });
    }
  } catch {
    return; // partial failure: leave guard unset, retry next startup
  }

  try {
    await s.local.set({ [MIGRATED_KEY]: true });
  } catch {
    // ignore: worst case we re-run and idempotently overwrite next time
  }
}
```

- [ ] **Step 4: Run the migration tests to verify they pass**

Run: `npx vitest run features/persistence/migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/persistence/migrate.ts features/persistence/migrate.test.ts
git commit -m "feat: one-time migration of saved loops to storage.sync

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Run the migration on background startup

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Add the migration call**

Replace the file with:

```ts
import {
  createInitialBackgroundState,
  reduceBackgroundState,
  type RuntimeMessage
} from "../shared/messaging/protocol";
import { migrateToSync } from "../features/persistence/migrate";

export default defineBackground(() => {
  // One-time move of saved loops from storage.local to storage.sync. Fire and
  // forget: it guards itself and retries on a later startup if it fails.
  void migrateToSync();

  let state = createInitialBackgroundState();

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    const senderTabId = sender.tab?.id ?? null;
    state = reduceBackgroundState(state, message, senderTabId);
    return Promise.resolve({ ok: true });
  });
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors in `background.ts`).

- [ ] **Step 3: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: run saved-loops sync migration on startup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Update call sites

`loadEntry` lost its `now` parameter (3rd arg is now `title`), and the loop-store functions take `Partial<LoopStorage>` instead of a single `StorageArea`. Fix the two production call sites and the popup test seam.

**Files:**
- Modify: `entrypoints/content/pageUi.tsx`
- Modify: `entrypoints/popup/App.tsx`
- Modify: `entrypoints/popup/App.test.tsx`

- [ ] **Step 1: Fix the two `loadEntry` calls in `pageUi.tsx`**

At `pageUi.tsx:275`, change:

```ts
    const entry = await loadEntry(id, undefined, undefined, getVideoTitle() ?? undefined);
```
to:
```ts
    const entry = await loadEntry(id, undefined, getVideoTitle() ?? undefined);
```

At `pageUi.tsx:301`, change:

```ts
    await loadEntry(videoId, undefined, undefined, getVideoTitle() ?? undefined);
```
to:
```ts
    await loadEntry(videoId, undefined, getVideoTitle() ?? undefined);
```

(The `addLoop`, `listEntries`, `setLastUsed`, and `removeLoop` calls in this file pass no storage/now argument and need no change.)

- [ ] **Step 2: Update `App.tsx` to wrap the `area` seam for loop-store calls**

The `area` prop is a single `StorageArea` used as both a settings store (local) and the loop store. `settingsStore` functions keep taking `area`; the loop-store functions now take `{sync, local}`. In production `area` is `undefined` (defaults apply); in tests the one fake area serves as both sync and local.

Replace `listEntries(area)` at line 34:

```ts
    void listEntries(area ? { sync: area, local: area } : undefined).then(setVideos);
```

Replace `removeVideo(videoId, area)` at line 53:

```ts
    void removeVideo(videoId, area ? { sync: area, local: area } : undefined);
```

The `StorageArea` import stays (still used for the `area` prop type and the settings calls). Leave `getEnabled(area)`, `setEnabled(next, area)`, and `requestLaunch(videoId, area)` unchanged.

- [ ] **Step 3: Update the popup test seed if it seeds saved loops**

Run: `grep -n "you-loop:saved\|listEntries\|SavedVideo\|area=" entrypoints/popup/App.test.tsx`

If the test seeds loops under the legacy `you-loop:saved` blob key, change the fake `area` to store per-video keys instead. A video is seeded as:

```ts
// import { keyFor } from "../../features/persistence/loopStore";
{ [keyFor("vid1")]: { loops: [/* ... */], lastUsedId: null, addedAt: 100, title: "One" } }
```

The fake area's `get` must support `get(null)` returning all keys (required by `listEntries`). If the existing fake only handles a string key, extend it exactly as in `loopStore.test.ts`'s `makeArea` (return `Object.fromEntries(data)` when the key is `null`).

If `App.test.tsx` does not seed loops (only toggles enabled / lists empty), no change is needed beyond confirming it still passes.

- [ ] **Step 4: Run the affected suites**

Run: `npx vitest run entrypoints/popup/App.test.tsx entrypoints/content/pageUi.test.tsx`
Expected: PASS. If `pageUi.test.tsx` calls `loadEntry` with the old 4-arg form or asserts on `lastSeen`, apply the same argument shift / field rename there.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/pageUi.tsx entrypoints/popup/App.tsx entrypoints/popup/App.test.tsx
git commit -m "refactor: update saved-loops call sites for sync storage API

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole project**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: PASS. If any suite references the removed `lastSeen` field or the old `area?: StorageArea` loop-store signature, fix it with the same patterns above (field → `addedAt`, single area → `{sync, local}`), then re-run.

- [ ] **Step 3: Build both browser targets to confirm the bundle is valid**

Run: `npm run build && npm run build:firefox`
Expected: Both builds succeed.

- [ ] **Step 4: Manual smoke check (load the dev build, optional but recommended)**

Run: `npm run dev`
Then in the browser: save a loop on a YouTube video, reload — it persists. Open the popup — the video appears. If signed into the browser profile on a second device with the extension, the loop appears there after sync settles (seconds to a couple of minutes).

- [ ] **Step 5: Final commit if any verification fixes were made**

```bash
git add -A
git commit -m "test: align remaining suites with sync storage API

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** per-video keys (Task 1–2), LWW via per-key sync default (inherent, no code), drop `lastSeen` + `addedAt` sort (Task 1–2), migrate-once + seed `addedAt` from `lastSeen` + idempotent + partial-failure retry (Task 3), background wiring (Task 4), write-failure local fallback + merged read (Task 2), no manifest change noted (File Structure). All spec sections map to a task.
- **Type consistency:** `SyncArea`/`LoopStorage`/`resolveStorage`/`keyFor`/`SAVED_KEY_PREFIX`/`VideoEntry.addedAt` defined in Task 1 are used identically in Tasks 2–5. `loadEntry(videoId, storage?, title?)` and `Partial<LoopStorage>` signatures match across implementation, tests, and call sites.
- **No placeholders:** every code step shows complete code; the only conditional is Task 5 Step 3 (popup test), gated on a grep because the existing seed shape is unknown — both branches are specified.
