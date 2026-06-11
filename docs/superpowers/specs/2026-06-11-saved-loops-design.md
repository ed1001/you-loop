# Saved loops per video — design

Date: 2026-06-11

## Summary

Let users save named loops per YouTube video and pick them from a list. A
video can hold several saved loops (e.g. "verse", "chorus"); each stores the
main loop range and the zoom sub-region. Saved loops persist in extension
storage and restore automatically when the user returns to a video. Also
changes the default loop range for unsaved videos.

Two related changes:

1. **Default range** — a fresh video (no saved loops) seeds its loop to the
   middle three-fifths, `[20%, 80%]`, replacing today's `[25%, 50%]`.
2. **Saved loops** — explicit save into a per-video, named list, with auto
   restore on revisit, managed from a popover on the loop panel.

## Goals

- Save the current main loop + zoom sub-region as a named loop for the current
  video.
- Keep multiple named loops per video; apply, replace, rename, delete them.
- Auto-apply the last-used loop when returning to a video.
- Persist across sessions and across Chrome + Firefox.
- Bound storage growth.

## Non-goals (YAGNI)

- No cross-video library / browser of all saved videos.
- No persistence of loop on/off, play mode, speed, or zoom on/off — only
  positions persist. Loop starts **off** on every visit; the user presses power
  to activate (unchanged from today).
- No import/export, sync across devices, or sharing.
- No hard cap on the number of loops per video (only the 200-video cap below).

## Definitions

- **videoId** — the `v` query param of the watch URL
  (`new URLSearchParams(location.search).get("v")`). Null on non-watch pages →
  saving disabled, no restore.
- **main** — `state.loopSegment`, the main loop range.
- **zoom** — `zoomLoop`, the zoom sub-region (may be null).
- **selected loop** — the saved loop currently applied (`selectedLoopId`), or
  null when current positions are freeform/unsaved.
- **dirty** — a loop is selected and the current main/zoom differ from its
  stored values (beyond a small tolerance).

## Data model

Extension storage (`browser.storage.local`, key `you-loop:saved`):

```ts
type SavedLoop = {
  id: string;            // crypto.randomUUID()
  name: string;
  main: LoopSegment;     // { start, end }
  zoom: LoopSegment | null;
};

type VideoEntry = {
  loops: SavedLoop[];
  lastUsedId: string | null;
  lastSeen: number;      // ms epoch; LRU key, touched on save and on access
};

type SavedStore = Record<string /* videoId */, VideoEntry>;
```

- `browser.storage.local` is the WXT-idiomatic, cross-browser store. The
  `storage` permission is already declared in `wxt.config.ts`, and `browser` is
  auto-imported (as used in `entrypoints/background.ts`).
- `localStorage` rejected: page-origin scoped, less idiomatic for extensions.

### LRU eviction

- Cap: **200 videos** (`MAX_SAVED_VIDEOS = 200`).
- `lastSeen` is updated both when a video's loops change (save/replace/rename/
  delete) and when the video is loaded with existing saved loops
  (touch-on-access). So revisiting a video moves it back to newest.
- On save, if adding a new video would exceed the cap, evict the entry with the
  smallest `lastSeen` first.

## Components

### `features/persistence/loopStore.ts` (new)

Pure-ish wrapper over a storage area; the area is injectable so tests pass a
stub (no real `browser` needed). Default area is `browser.storage.local`.

```ts
type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

// All functions take the videoId and operate on its VideoEntry.
loadEntry(videoId, area?): Promise<VideoEntry | null>
  // Returns the entry (or null). On a hit, touches lastSeen and writes back.

addLoop(videoId, name, main, zoom, area?): Promise<SavedLoop>
  // Creates a SavedLoop with a fresh id, appends to the video's loops,
  // sets lastUsedId = new id, touches lastSeen, applies LRU eviction.

updateLoop(videoId, loopId, main, zoom, area?): Promise<void>
  // Overwrites the positions of an existing loop in place (Replace / Update).
  // Sets lastUsedId = loopId, touches lastSeen.

renameLoop(videoId, loopId, name, area?): Promise<void>

removeLoop(videoId, loopId, area?): Promise<void>
  // Deletes the loop. If it was lastUsedId, clears lastUsedId. If the video has
  // no loops left, deletes the whole VideoEntry.

setLastUsed(videoId, loopId, area?): Promise<void>
  // Records which loop was last applied (called when the user picks one from
  // the list). Touches lastSeen.
```

Constraints: each writer does read-modify-write of the whole `SavedStore` under
the single key. Calls within one user gesture are serialized by `await`, so no
locking needed.

### `features/playback/reducer.ts`

- Add `DEFAULT_LOOP_FRACTION = 0.2`.
- Add `defaultLoopSegment(duration: number): LoopSegment` →
  `{ start: duration * 0.2, end: duration * 0.8 }`, run through
  `normalizeLoopSegment`. For `duration <= 0`, callers must not seed (see
  wiring); the function itself returns a normalized segment regardless.

### `entrypoints/content/pageUi.tsx` — `renderTimelineCursors`

New closure state: `currentVideoId: string | null`, `savedLoops: SavedLoop[]`,
`selectedLoopId: string | null`, `loopsOpen: boolean` (popover).

- **`loadForVideo(videoId)`** — runs on mount and on each navigation:
  1. Gate until `getVideoDuration(video) > 0` (metadata ready); if not ready,
     wait for the next `loadedmetadata` / `durationchange` then retry.
  2. `currentVideoId = videoId`.
  3. `const entry = await loadEntry(videoId)`. Race guard: if `currentVideoId`
     changed during the await, abort.
  4. If `entry?.loops.length`: pick `lastUsedId` loop (fallback first); set
     `state.loopSegment = loop.main`, `zoomLoop = loop.zoom`,
     `selectedLoopId = loop.id`, `savedLoops = entry.loops`.
  5. Else: `state.loopSegment = defaultLoopSegment(duration)`, `zoomLoop = null`,
     `selectedLoopId = null`, `savedLoops = []`.
  6. `render()`.
- **Navigation detection**: listen for `yt-navigate-finish` on `document` and
  for the video's `loadedmetadata`; on either, read the current `v` param and,
  if it differs from `currentVideoId`, call `loadForVideo`. Listeners removed in
  `stop()`.
- **`enableLoop`** stops seeding a default — `loadForVideo` has already set
  `loopSegment`. It only flips `loopEnabled = true`.
- **Dirty check**: `isDirty()` compares current main/zoom to the selected loop's
  stored values with a tolerance (positions are rounded to 3 decimals in
  `normalizeLoopSegment`; compare with `epsilon = 1e-3`). Freeform (no selected
  loop) counts as not-dirty (the panel button reads "no saved loop selected").
- **Save actions** (call `loopStore`, then update `savedLoops`/`selectedLoopId`,
  then `render()`):
  - Save as new (with name) → `addLoop`.
  - Update selected → `updateLoop(currentVideoId, selectedLoopId, ...)`.
  - Replace a specific loop → `updateLoop(currentVideoId, rowId, ...)`.
  - Rename → `renameLoop`. Delete → `removeLoop`. Apply row → load that loop's
    positions into state + `setLastUsed`.

### `features/player-overlay/LoopPanel.tsx`

- New **Saved-loops button** (bookmark glyph), disabled when loop is off.
  Shows a dot badge when `dirty`.
- New props: `canSaveLoops` (loop on & videoId present), `loopsDirty`,
  `savedLoops`, `selectedLoopId`, `loopsOpen`, and handlers
  `onToggleLoopsPopover`, `onSaveAsNew(name)`, `onUpdateSelected`,
  `onReplaceLoop(id)`, `onRenameLoop(id, name)`, `onDeleteLoop(id)`,
  `onApplyLoop(id)`.
- **Popover** (anchored to the button, mounted within the overlay so YouTube's
  progress-bar pointer handlers are swallowed like the other controls):
  - **Save as new**: a text input + confirm (no `prompt()` — browser dialogs
    block the extension's message channel).
  - **Update "‹name›"**: shown only when a loop is selected and dirty.
  - **List**: one row per `savedLoops` entry — name, apply on click, and
    Replace / Rename (inline) / Delete actions. The selected row is marked; a
    dirty selected row shows the unsaved indicator.

### `features/player-overlay/HelpModal.tsx`

- Add a **Saved loops** entry to the Panel controls list (bookmark glyph + one
  line).
- Add a short **Memory** note:
  > Save the current loop and zoom as a named loop for this video — keep several
  > per video, and replace or rename them anytime. Saved loops restore
  > automatically when you return (the last-used one applies). The last 200
  > videos are kept; past that the oldest goes first, and revisiting a video
  > moves it back to newest.

### Styles

Popover, list rows, save button, and dirty badge styles live alongside the
existing overlay styles in `entrypoints/content/pageUi.tsx`
(`ensureDocumentStyles`).

## Data flow

- **Open / navigate** → `loadForVideo(videoId)` → `loadEntry` (touch `lastSeen`)
  → seed/restore state → `render`.
- **Pick a loop from the list** → load its positions → `setLastUsed` → `render`.
- **Save as new / update / replace** → `addLoop` / `updateLoop` → update
  `savedLoops` + `selectedLoopId` → `render`.
- **Drag a handle** → update state + recompute `dirty` → `render` (no write
  until an explicit save action).

## Error handling & edge cases

- **No videoId** (non-watch page): saving disabled, no restore; default seeding
  still applies for the loop UI.
- **Duration not ready**: defer seeding until `loadedmetadata` /
  `durationchange` reports a finite, positive duration.
- **Rapid navigation**: race guard via `currentVideoId` re-check after the
  storage await.
- **Storage read/write failure**: catch and log; treat a failed read as "no
  saved loops" (fall back to default) so the loop UI still works.
- **Stored zoom outside current main** (main edited then a stale zoom loaded):
  clamp zoom into main via the existing `clampLoopToRegion`.
- **Duplicate names**: allowed; loops are keyed by `id`, not name.

## Testing

- `features/persistence/loopStore.test.ts` (with a stub storage area):
  - add → load round-trip; multiple loops per video.
  - `updateLoop` overwrites in place and sets `lastUsedId`.
  - `renameLoop`, `removeLoop` (incl. removing the last loop deletes the entry).
  - `setLastUsed` records selection.
  - touch-on-access: `loadEntry` bumps `lastSeen`.
  - LRU eviction: 201st distinct video evicts the smallest `lastSeen`;
    revisiting an old video before the overflow spares it.
- `features/playback/reducer.test.ts`:
  - `defaultLoopSegment` returns `[20%, 80%]` for typical durations.
  - normalization / duration-0 behavior.
- `entrypoints/content/pageUi.test.tsx`: light check that loading a video with
  a saved entry applies its positions (if feasible with the existing test
  harness).

## Files touched

- `features/persistence/loopStore.ts` (new) + test.
- `features/playback/reducer.ts` (+ test).
- `entrypoints/content/pageUi.tsx` (wiring, styles).
- `features/player-overlay/LoopPanel.tsx` (button + popover).
- `features/player-overlay/HelpModal.tsx` (docs).
