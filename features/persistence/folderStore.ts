import {
  listEntries,
  resolveStorage,
  setVideoFolder,
  type LoopStorage,
  type SyncArea
} from "./loopStore";

// Folders for the popup's saved-video list. The folder list is one small key
// in storage.sync (local fallback, same pattern as the per-video loop keys);
// membership lives on each video entry as `folderId`. Deleting a folder only
// clears that membership — videos and their loops are never touched.
export const FOLDERS_KEY = "you-loop:folders";

// Per-device UI state: which popup groups are collapsed. Folder ids, plus
// UNFILED_GROUP for the Unfiled group.
export const COLLAPSED_GROUPS_KEY = "you-loop:collapsed-groups";
export const UNFILED_GROUP = "unfiled";

export type Folder = { id: string; name: string; createdAt: number };

function sanitizeFolders(value: unknown): Folder[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (f): f is Folder =>
      f != null &&
      typeof f.id === "string" &&
      typeof f.name === "string" &&
      typeof f.createdAt === "number"
  );
}

async function readFolders(s: LoopStorage): Promise<Folder[]> {
  try {
    const r = await s.sync.get(FOLDERS_KEY);
    if (r[FOLDERS_KEY] != null) return sanitizeFolders(r[FOLDERS_KEY]);
  } catch {
    // fall through to local
  }
  try {
    const r = await s.local.get(FOLDERS_KEY);
    if (r[FOLDERS_KEY] != null) return sanitizeFolders(r[FOLDERS_KEY]);
  } catch {
    // give up
  }
  return [];
}

async function writeFolders(s: LoopStorage, folders: Folder[]): Promise<void> {
  try {
    await s.sync.set({ [FOLDERS_KEY]: folders });
  } catch {
    try {
      await s.local.set({ [FOLDERS_KEY]: folders });
    } catch {
      // Best-effort: a failed write leaves the prior value intact.
    }
  }
}

// Folders in creation order.
export async function listFolders(
  storage?: Partial<LoopStorage>
): Promise<Folder[]> {
  const folders = await readFolders(resolveStorage(storage));
  return [...folders].sort((a, b) => a.createdAt - b.createdAt);
}

export async function createFolder(
  name: string,
  storage?: Partial<LoopStorage>,
  now: number = Date.now()
): Promise<Folder> {
  const s = resolveStorage(storage);
  const folder: Folder = { id: crypto.randomUUID(), name, createdAt: now };
  await writeFolders(s, [...(await readFolders(s)), folder]);
  return folder;
}

export async function renameFolder(
  id: string,
  name: string,
  storage?: Partial<LoopStorage>
): Promise<void> {
  const s = resolveStorage(storage);
  const folders = await readFolders(s);
  if (!folders.some((f) => f.id === id)) return;
  await writeFolders(
    s,
    folders.map((f) => (f.id === id ? { ...f, name } : f))
  );
}

// Removes the folder and moves its videos back to Unfiled. Readers already
// treat an unknown folderId as unfiled, so a partial failure (or a delete on
// another device) can never hide a video.
export async function deleteFolder(
  id: string,
  storage?: Partial<LoopStorage>
): Promise<void> {
  const s = resolveStorage(storage);
  const folders = await readFolders(s);
  await writeFolders(
    s,
    folders.filter((f) => f.id !== id)
  );
  const videos = await listEntries(s);
  for (const video of videos) {
    if (video.folderId === id) await setVideoFolder(video.videoId, null, s);
  }
}

export async function getCollapsedGroups(area?: SyncArea): Promise<string[]> {
  try {
    const a = area ?? (browser.storage.local as unknown as SyncArea);
    const value = (await a.get(COLLAPSED_GROUPS_KEY))[COLLAPSED_GROUPS_KEY];
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export async function setCollapsedGroups(
  groups: string[],
  area?: SyncArea
): Promise<void> {
  try {
    const a = area ?? (browser.storage.local as unknown as SyncArea);
    await a.set({ [COLLAPSED_GROUPS_KEY]: groups });
  } catch {
    // Per-device convenience only.
  }
}
