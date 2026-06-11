import type { LoopSegment } from "../playback/types";

export const SAVED_STORE_KEY = "you-loop:saved";
// Entries are tiny (~1KB/video), so this is a runaway-growth backstop rather
// than a storage limit — well under browser.storage.local's quota.
export const MAX_SAVED_VIDEOS = 1000;

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
};

export type SavedStore = Record<string, VideoEntry>;

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

// Drop the least-recently-seen videos once the cap is exceeded.
function evict(store: SavedStore): void {
  const ids = Object.keys(store);
  if (ids.length <= MAX_SAVED_VIDEOS) return;
  const byOldest = ids.sort((a, b) => store[a].lastSeen - store[b].lastSeen);
  for (const id of byOldest.slice(0, ids.length - MAX_SAVED_VIDEOS)) {
    delete store[id];
  }
}

export async function countVideos(area?: StorageArea): Promise<number> {
  const store = await readStore(resolveArea(area));
  return Object.keys(store).length;
}

export async function loadEntry(
  videoId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<VideoEntry | null> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return null;
  entry.lastSeen = now; // touch-on-access: revisiting refreshes LRU place
  store[videoId] = entry;
  await writeStore(a, store);
  return entry;
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
  evict(store);
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

export async function updateLoop(
  videoId: string,
  loopId: string,
  main: LoopSegment,
  zoom: LoopSegment | null,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  await mutateEntry(videoId, area, (entry) => {
    entry.loops = entry.loops.map((l) =>
      l.id === loopId ? { ...l, main, zoom } : l
    );
    entry.lastUsedId = loopId;
    entry.lastSeen = now;
  });
}

// fallow-ignore-next-line code-duplication -- minimal CRUD twin of updateLoop
export async function renameLoop(
  videoId: string,
  loopId: string,
  name: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  await mutateEntry(videoId, area, (entry) => {
    entry.loops = entry.loops.map((l) => (l.id === loopId ? { ...l, name } : l));
    entry.lastSeen = now;
  });
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
