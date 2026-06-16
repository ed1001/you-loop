# Cross-Device Sync for Saved Loops — Design

Date: 2026-06-16
Status: Approved (pending spec review)

## Summary

Saved loops currently persist to `browser.storage.local`, so they never leave the
machine they were created on. This change moves the saved-loops store to
`browser.storage.sync`, so a user's loops follow their browser profile across
devices (Chrome via Google account, Firefox via Firefox Account) with no backend,
no auth, and no database. The extension already targets both browsers through the
WebExtension `browser.*` API, so a single code path covers both.

Scope is **saved loops only**. The extension on/off toggle (`you-loop:enabled`) and
the transient launch handoff (`you-loop:launch`) stay device-local. The launch
handoff in particular must never sync — it is ephemeral (30s TTL) and device-bound.

## Constraints

`storage.sync` quotas (Chrome and Firefox, same numbers):

- ~100 KB total
- 8 KB per item (per key)
- 512 keys max
- Write-rate limits (~120/min, ~1800/hr)

The current store keeps the entire library under one key (`you-loop:saved`), which
caps the whole library at one 8 KB item (~20–40 loops total) and re-writes
everything on any edit. That does not fit `storage.sync`. The layout must shard.

## Decisions

1. **Per-video keys.** One key per video instead of a single blob. Each video gets
   its own 8 KB budget; the library can hold ~512 videos. Editing one video never
   touches another's key, which also minimizes conflict blast radius.
2. **Last-write-wins conflicts.** Accept the platform default per-key reconciliation.
   For a solo-user practice tool, two devices editing the *same* video while both
   offline is rare; worst case is losing one loop edit on one video. No merge logic.
3. **Drop `lastSeen`; sort by `addedAt`.** `lastSeen` was written on every video
   visit (touch-on-access) — free on local storage, but on sync it means a write +
   cross-device churn per visit for data nobody edited. Remove it. Replace the
   cross-video list's recency sort with an `addedAt` timestamp stamped once at entry
   creation. Sharded+synced data has no reliable insertion order (`get(null)` key
   order is unspecified and meaningless across merged devices), so an explicit field
   is required to reproduce a stable, identical order on every device.
4. **Migrate once, sync-only after, local fallback on write failure.** A one-time
   migration moves the old local blob to per-video sync keys. After that, sync is the
   source of truth. If a sync write fails (quota / oversized item / too many keys),
   that one write falls back to `storage.local` and reads merge both areas, so the
   affected video still works.

## Storage Layout

### Keys

| Key | Area | Holds |
| --- | --- | --- |
| `you-loop:saved:v:<videoId>` | sync | one `VideoEntry` |
| `you-loop:saved` | local | legacy single blob — left in place after migration (rollback safety), never read in steady state |
| `you-loop:sync-migrated` | local | migration guard flag |

The `you-loop:saved:v:` prefix namespaces per-video keys so `get(null)` can be
filtered without colliding with other keys.

### Types

`VideoEntry` loses `lastSeen`, gains `addedAt`:

```ts
export type VideoEntry = {
  loops: SavedLoop[];
  lastUsedId: string | null;
  addedAt: number;   // set once when the entry is first created; never updated
  title?: string;
};
```

`SavedVideo` (the cross-video summary) exposes `addedAt` instead of `lastSeen`:

```ts
export type SavedVideo = {
  videoId: string;
  title?: string;
  count: number;
  addedAt: number;
};
```

`SavedLoop` is unchanged.

## Module Changes (`features/persistence/loopStore.ts`)

The public API signatures are **unchanged** — `loadEntry`, `listEntries`, `addLoop`,
`removeLoop`, `removeVideo`, `setLastUsed`. Callers (`SavedLoopsModal`, `VideoList`,
the player panel) need no changes beyond the type field rename. The rework lives in
the private read/write seam.

- **Backing area:** default resolves to `browser.storage.sync` instead of
  `browser.storage.local`.
- **`readEntry(videoId)` / `writeEntry(videoId, entry)`:** replace the
  whole-store `readStore`/`writeStore`. Each operates on a single
  `you-loop:saved:v:<videoId>` key.
- **`listEntries`:** calls `area.get(null)`, filters keys by the
  `you-loop:saved:v:` prefix, maps to `SavedVideo[]`, sorts by `addedAt` descending
  (videoId as a stable tiebreaker).
- **`addLoop`:** when creating a new entry, stamp `addedAt = now`. Existing entries
  keep their original `addedAt`.
- **`loadEntry`:** no longer writes on every visit. Keeps the title backfill, but
  writes only when the stored title actually differs from the incoming one (rare →
  ~zero sync writes on normal browsing). No `lastSeen` touch.
- **`removeLoop` / `removeVideo` / `setLastUsed`:** same behavior, now read-modify-
  write a single per-video key. Deleting the last loop removes that video's key.

## Migration

Runs once at background startup (`entrypoints/background.ts`):

1. If `you-loop:sync-migrated` is set in local, skip.
2. Read the legacy blob `you-loop:saved` from local. If absent/empty, set the guard
   and stop (fresh install — nothing to migrate).
3. For each `[videoId, entry]`:
   - `addedAt = entry.lastSeen ?? now` (seed from the field being dropped so the
     migrated order approximates the pre-migration order; `now` only if both absent).
   - Strip `lastSeen`.
   - Write `you-loop:saved:v:<videoId>` to sync.
4. On full success, set `you-loop:sync-migrated`. Leave the legacy local blob in
   place as a rollback safety net; do not delete it.
5. If any write fails, do **not** set the guard — retry on next startup. Re-running
   is idempotent: already-written keys are overwritten with identical content.

## Write-Failure Fallback (steady state)

- Every write attempts `storage.sync` first.
- On failure (quota, item > 8 KB, > 512 keys, rate limit), write that one key to
  `storage.local` instead and record a warning (console + in-memory flag).
- Reads merge: union of `storage.sync.get(null)` and the matching `storage.local`
  per-video keys, with sync winning on key collision. A video that could not sync
  still appears and works locally.

## Testing

`loopStore.test.ts` already injects a fake `StorageArea`. Extend the fake to model
per-key `get`/`set` and `get(null)`.

- Existing API tests stay green (signatures unchanged).
- Per-video key read/write round-trips.
- `listEntries`: prefix filtering and `addedAt`-desc ordering (with tiebreaker).
- `addLoop`: stamps `addedAt` on creation; does not change it on later edits.
- `loadEntry`: no write on unchanged title; writes only on a real title change; never
  writes a recency field.
- Migration: old blob → per-video keys; `addedAt` seeded from `lastSeen`; guard set on
  success; idempotent re-run; partial failure leaves the guard unset.
- Write-failure path: a fake area that throws on the nth write falls back to local;
  merged read returns both sync and local-only entries with sync winning collisions.

## Non-Goals

- Syncing the on/off toggle or any other setting.
- Merge / CRDT conflict resolution beyond last-write-wins.
- Any backend, account system, or database.
- A migration UI — migration is silent and automatic.
