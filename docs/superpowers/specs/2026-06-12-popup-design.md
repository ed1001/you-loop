# Popup: on/off toggle + saved-video library

Date: 2026-06-12
Status: approved

## Goal

A toolbar popup that (1) turns the extension on and off and (2) lists saved
videos as a launcher for the practice library. Clicking a saved video opens it
with the loop panel already enabled, overriding the panel's default-off state.

## Decisions

- **Off semantics:** off removes everything — overlay pill, timeline handles,
  keyboard shortcuts, injected styles. YouTube is stock.
- **Scope:** global (all tabs) and persistent across browser restarts.
- **List action:** clicking a row opens the video in a new tab and auto-enables
  the loop panel (loads the video's last-used loop via the existing
  `loadForVideo` path).
- **Management:** delete-video only. No search, no rename, no loop-level
  editing in the popup.
- **Layout:** compact header — wordmark + small switch in one header row,
  saved-video list below ("Layout A" from brainstorm mockups).
- **List style:** matches the Saved Loops modal's library tab — text rows with
  title, loop count, chevron. No thumbnails.

## Architecture (storage-first)

`browser.storage.local` is the single source of truth. No background
involvement; the vestigial `setEnabled`/`getEnabled` messages and the
`enabled` field in `shared/messaging/protocol.ts` + background reducer are
deleted.

### 1. Popup entrypoint

New `entrypoints/popup/` (WXT auto-registers `action.default_popup`):

- `index.html`, `main.tsx`, `App.tsx` — React, ~320px wide, Étude dark theme.
- Wordmark reuses `EtudeWordmark` and the bundled Fraunces woff2. The popup is
  an extension page, so the font loads from a direct `/fonts/...` URL — no
  `web_accessible_resources` change needed.
- Header row: wordmark left, on/off switch right.
- Below: "Saved videos" label + `VideoList`.

### 2. Enabled flag

New `features/persistence/settingsStore.ts`:

- Key `you-loop:enabled` in `browser.storage.local`; absent = `true` (on).
- `getEnabled(): Promise<boolean>`, `setEnabled(value): Promise<void>`,
  `watchEnabled(cb): () => void` wrapping `browser.storage.onChanged`.

Popup switch writes the flag. Content script:

- On load: check flag before mounting anything.
- While running: `watchEnabled` — off → full unmount (overlay, handles,
  shortcut listeners, injected style tags) and reset playback rate to 1×;
  on → remount.

### 3. Shared video list

Extract from `SavedLoopsModal.tsx` / `pageUi.styles.ts` into
`features/video-list/`:

- `VideoList.tsx` — the row markup currently inline in the modal's library
  tab (`you-loop-lm-vrow` family): title (fallback videoId), loop count,
  chevron. Props cover the modal's `isCurrent`/"Playing"/disabled behavior
  and an optional `onDelete`.
- `videoList.styles.ts` — the corresponding CSS block, imported by both
  `pageUi.styles.ts` and the popup stylesheet.

Popup usage: rows sorted `lastSeen` desc from `listEntries()`; click opens
`https://www.youtube.com/watch?v=<id>` in a new tab and closes the popup;
hover ✕ with two-stage inline confirm (✕ → "Delete?" → removes). New
`removeVideo(videoId)` in `loopStore.ts`. Empty state: same wording as the
modal ("No saved videos yet. Videos with saved loops appear here.").

### 4. Launch handoff

One-shot key `you-loop:launch` = `{ videoId, ts }` in `storage.local`:

- Popup writes it just before `tabs.create`.
- Content script, once the video is ready: if `videoId` matches the current
  video and `ts` is fresh (< 30 s), auto-enable the loop (existing
  `enableLoop` path; last-used loop is already pre-seeded by `loadForVideo`)
  and clear the key. Stale or mismatched → ignore and clear.

## Testing

- `settingsStore`: default-on when key absent, set/get round-trip, watch
  callback fires on change.
- `loopStore.removeVideo`: removes entry, no-op on unknown id.
- Launch handoff: match → enables + clears; stale ts → ignored + cleared;
  mismatched videoId → ignored + cleared.
- Popup `App`: renders list from store, toggle writes flag, delete is
  two-stage, row click opens tab + writes handoff key.
- Content gating: overlay does not mount when flag off; unmounts when flag
  flips off (existing `pageUi.test.tsx` patterns).

## Out of scope

- Search/filter, rename, loop-level management in the popup.
- Per-tab enable state, toolbar badge.
- Thumbnails.
