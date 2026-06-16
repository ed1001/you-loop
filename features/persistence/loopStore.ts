import type { LoopSegment } from "../playback/types";

// Legacy single-blob key (storage.local). Read only by the migration.
export const SAVED_STORE_KEY = "you-loop:saved";

// Per-video key prefix in storage.sync: `you-loop:saved:v:<videoId>`.
// fallow-ignore-next-line unused-export
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
// fallow-ignore-next-line unused-type
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

// fallow-ignore-next-line unused-export
export function resolveStorage(storage?: Partial<LoopStorage>): LoopStorage {
  return {
    sync: storage?.sync ?? (browser.storage.sync as unknown as SyncArea),
    local: storage?.local ?? (browser.storage.local as unknown as SyncArea)
  };
}

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
