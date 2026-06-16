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
