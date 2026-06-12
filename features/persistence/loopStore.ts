import type { LoopSegment } from "../playback/types";

export const SAVED_STORE_KEY = "you-loop:saved";

export type SavedLoop = {
  id: string;
  name: string;
  main: LoopSegment;
  zoom: LoopSegment | null;
};

export type VideoEntry = {
  loops: SavedLoop[];
  lastUsedId: string | null;
  lastSeen: number;
  // The video's title, captured on visit. Optional: entries saved before
  // titles were tracked (or where capture failed) simply lack it, and the
  // cross-video list falls back to the id.
  title?: string;
};

export type SavedStore = Record<string, VideoEntry>;

// A one-line summary of a saved video, for the cross-video index. Derived from
// the store; never persisted in this shape.
export type SavedVideo = {
  videoId: string;
  title?: string;
  count: number;
  lastSeen: number;
};

export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

function resolveArea(area?: StorageArea): StorageArea {
  if (area) return area;
  return browser.storage.local as unknown as StorageArea;
}

async function readStore(area: StorageArea): Promise<SavedStore> {
  try {
    const result = await area.get(SAVED_STORE_KEY);
    return (result[SAVED_STORE_KEY] as SavedStore) ?? {};
  } catch {
    return {};
  }
}

async function writeStore(area: StorageArea, store: SavedStore): Promise<void> {
  try {
    await area.set({ [SAVED_STORE_KEY]: store });
  } catch {
    // Best-effort: a failed write leaves the prior store intact.
  }
}

export async function loadEntry(
  videoId: string,
  area?: StorageArea,
  now: number = Date.now(),
  title?: string
): Promise<VideoEntry | null> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return null;
  entry.lastSeen = now; // touch-on-access: records when last revisited
  // Backfill the title on visit, so entries saved before titles were tracked
  // gain one (and any rename is picked up). Only overwrite with a real value.
  if (title != null && title !== "") entry.title = title;
  store[videoId] = entry;
  await writeStore(a, store);
  return entry;
}

// All saved videos as one-line summaries, most-recently-seen first. Powers the
// cross-video index in the saved-loops modal.
export async function listEntries(area?: StorageArea): Promise<SavedVideo[]> {
  const a = resolveArea(area);
  const store = await readStore(a);
  return Object.entries(store)
    .map(([videoId, entry]) => ({
      videoId,
      title: entry.title,
      count: entry.loops.length,
      lastSeen: entry.lastSeen
    }))
    .sort((x, y) => y.lastSeen - x.lastSeen);
}

export async function addLoop(
  videoId: string,
  name: string,
  main: LoopSegment,
  zoom: LoopSegment | null,
  area?: StorageArea,
  now: number = Date.now()
): Promise<SavedLoop> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const loop: SavedLoop = { id: crypto.randomUUID(), name, main, zoom };
  const entry = store[videoId] ?? { loops: [], lastUsedId: null, lastSeen: now };
  entry.loops = [...entry.loops, loop];
  entry.lastUsedId = loop.id;
  entry.lastSeen = now;
  store[videoId] = entry;
  await writeStore(a, store);
  return loop;
}

// Read-modify-write a single video's entry. No-op (no write) when the video
// has no saved entry. `apply` mutates the entry in place; it receives the whole
// store too so it can delete the entry when the last loop is removed.
async function mutateEntry(
  videoId: string,
  area: StorageArea | undefined,
  apply: (entry: VideoEntry, store: SavedStore) => void
): Promise<void> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return;
  apply(entry, store);
  await writeStore(a, store);
}

export async function removeLoop(
  videoId: string,
  loopId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  await mutateEntry(videoId, area, (entry, store) => {
    entry.loops = entry.loops.filter((l) => l.id !== loopId);
    if (entry.lastUsedId === loopId) entry.lastUsedId = null;
    if (entry.loops.length === 0) {
      delete store[videoId];
    } else {
      entry.lastSeen = now;
    }
  });
}

// Drop a video and all its loops from the library. No-op (no write) when the
// video has no entry.
export async function removeVideo(
  videoId: string,
  area?: StorageArea
): Promise<void> {
  const a = resolveArea(area);
  const store = await readStore(a);
  if (!(videoId in store)) return;
  delete store[videoId];
  await writeStore(a, store);
}

export async function setLastUsed(
  videoId: string,
  loopId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  await mutateEntry(videoId, area, (entry) => {
    entry.lastUsedId = loopId;
    entry.lastSeen = now;
  });
}
