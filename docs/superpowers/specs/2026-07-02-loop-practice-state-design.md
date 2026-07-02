# Loop practice state + saved-loops modal refresh — design

2026-07-02. Targets the 0.3.0 release.

## Goal

A saved loop captures the practice state it was rehearsed with (count-in
settings), can be updated in place from the current state, and the saved-loops
modal sheds its second tab and gets an information-density pass on the list.

## 1. Per-loop count-in snapshot

```ts
export type SavedLoop = {
  id: string;
  name: string;
  main: LoopSegment;
  zoom: LoopSegment | null;
  // Count-in settings captured at save time; absent on legacy loops.
  countIn?: CountInSettings | null;
};
```

- **Save** always snapshots the current per-video `{bpm, beatsPerBar,
  noteValue, bars}` into the loop — even when count-in is toggled off. The
  snapshot costs nothing and is correct if the metronome is turned on later.
- **Apply** of a loop carrying `countIn` restores those settings in memory and
  writes them through to the per-video store (so a reload agrees). A legacy
  loop without the field leaves current settings untouched.
- **Count-in on/off stays global.** Applying a loop never force-enables the
  metronome; it only makes the tempo right when it is used.
- **Sanitize on read.** Stored `countIn` runs through the same
  clamp-or-default guard as the per-video store (`intInRange`), exported from
  `countInStore` as `sanitizeCountInSettings`. Corrupt synced values must not
  reach the beat scheduler.
- **Sync/compat.** ~60 bytes per loop in `storage.sync` — negligible. The
  field is optional, so no migration; older extension versions ignore it.
  The per-video layer stays in `storage.local`: saved tempo syncs with the
  loop, an unsaved dial tweak stays on the machine (same model as unsaved
  regions today).

## 2. Dirty semantics

`isLoopDirty` compares the current state against the source loop across
`main`, `zoom`, **and `countIn`** (when the source loop stores one — legacy
loops never read tempo-dirty). A bpm tweak with a clean selected loop now
deselects the row and lights the update affordance; nothing is written back
silently (snapshot-on-save only).

## 3. Update a loop in place

When the current state descends from a saved loop (`selectedLoopId` retained
in pageUi even while the display selection is cleared by drift) and is dirty,
the save section shows an update block above "save as new":

```
╭─────────────────────────────────────────╮
│ ↻  Update "solo @140"                   │   teal ghost button
│    0:42–1:03 → 0:40–1:03 · ♩140 → 145   │   delta preview, changed fields only
╰─────────────────────────────────────────╯
                 ─ or ─
[ Name this loop              ]  [ Save ]
```

- The delta preview is the confirmation mechanism: it states exactly what will
  be overwritten (old → new; only fields that differ). No dialog.
- Commit overwrites `main`, `zoom`, and `countIn`, morphs the button to
  "Updated ✓", re-selects the row, and replays the existing apply flash.
- No source loop or no drift → the block is absent; modal reads as today.
- `updateLoop(videoId, id, patch)` added to `loopStore`. If the id no longer
  exists (deleted on another device between apply and update), the update is a
  no-op and the list refresh shows the loop gone.

## 4. Saved-videos tab removed

The popup already renders the identical `VideoList` and owns the polished
cross-video launch flow. The modal returns to a single pane:

- Delete: tab nav, two-phase pane crossfade, FLIP height tween,
  `savedVideos`/`currentVideoId`/`onOpenVideo` props, `refreshLibrary()`
  open-refresh in pageUi.
- Header subtitle keeps the current-selection readout.
- Popup untouched; `VideoList` lives on there.

## 5. List polish

Single-line rows keep the 220px list dense. Three additions:

- **Mini loop-map**: a 2px hairline track across the row's bottom edge with a
  teal band at the loop's position/length within the video (modal gains a
  `duration` prop). Same band language as the timeline; selected row's band
  brightens.
- **Tempo badge**: quiet `♩140 · 4/4` chip between name and range on rows
  carrying `countIn`.
- **Hover-reveal delete**: ✕ hidden until row hover or focus-within; red
  destructive hover unchanged.

## Error handling

- `sanitizeCountInSettings` guards every read of a stored snapshot.
- Legacy loops (no `countIn`): apply keeps current settings; dirty ignores
  tempo; update writes a snapshot (upgrading the loop).
- Update targeting a vanished id: silent no-op + list refresh.

## Testing

- `loopStore`: `updateLoop` round-trip; `addLoop` persists `countIn`; corrupt
  stored `countIn` sanitized on read; legacy entries load unchanged.
- `pageUi`: save snapshots current settings; apply restores + persists them;
  apply of legacy loop leaves settings alone; bpm drift flips dirty (badge
  case) while legacy source does not.
- Modal: update block renders only when drifted-with-source; delta preview
  shows only changed fields; commit calls `onUpdateLoop` and re-selects;
  hover-reveal delete accessible via keyboard focus; loop-map geometry.
- Removal fallout: tab-related tests deleted; popup `VideoList` tests
  untouched.
