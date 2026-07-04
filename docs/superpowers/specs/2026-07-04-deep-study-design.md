# Deep-study: practice marks inside the loop

**Date:** 2026-07-04
**Status:** Approved design

## Problem

While studying a passage in a loop, you repeatedly find trouble spots you want
to drill without losing the loop of the whole passage. Today the only options
are dragging the loop cursors (destroys the passage bounds) or re-seeking by
hand every repeat.

## Feature

Practice marks on the zoom strip. Shift-click the strip to drop a mark. Click a
mark to make it the temporary loop start: playback loops `[mark, loop end]` and
every restart key starts from the mark. Click it again to go back to the whole
loop. Shift-click a mark to remove it. Any number of marks; one active at most.

## Decisions (from brainstorm)

- **Loop bounds while a mark is active:** `[mark, loopEnd]` — practice from the
  trouble spot to the end of the passage, wrapping back to the mark.
- **Surface:** zoom strip only. The main YouTube bar is untouched. Marks
  require zoom to be open — that is where passage study happens and where
  placement precision lives.
- **Persistence:** marks save with saved loops (`SavedLoop`), restore on apply
  and on auto-apply of `lastUsedId`. The *active* mark is session-only.
- **Architecture:** pageUi closure state + pure helper module (approach A) —
  same altitude as `zoomLoop`, the existing precedent for loop refinements
  that live outside the playback reducer.
- No numbering, no mark cap, no marker dragging (remove + re-place), no new
  on/off toggle — marks are an always-available capability of the zoom strip.

## Model and playback semantics

State in the `renderTimelineCursors` closure (`entrypoints/content/pageUi.tsx`),
beside `zoomLoop`:

```ts
let marks: number[] = [];             // absolute video times, kept sorted
let activeMark: number | null = null; // at most one active
```

Pure module `features/playback/marks.ts`:

- `addMark(marks, time): number[]` — insert keeping sort order.
- `removeMark(marks, time): number[]`.
- `resolveSegment(base: LoopSegment | null, activeMark: number | null): LoopSegment | null`
  — when `activeMark` is strictly inside `base`, returns
  `{ start: activeMark, end: base.end }`; otherwise returns `base` unchanged
  (including `base == null`).

Playback hook — the single semantic change, at `effectiveSegment()`
(`pageUi.tsx:196`):

```ts
const effectiveSegment = (): LoopSegment | null =>
  zoomed && zoomLoop != null
    ? resolveSegment(zoomLoop, activeMark)
    : state.loopSegment;
```

The mark applies only while zoom is open — that is where marks are visible and
where the active one can be clicked off. Closing zoom reverts playback to the
main loop but *retains* `marks` and `activeMark` (mirroring how `zoomLoop`
survives a zoom toggle); reopening zoom resumes the drill where it was.

Everything downstream inherits the mark with **zero changes** to
`features/playback/shortcuts.ts` and `features/playback/controller.ts`,
because they already consume the segment via `getSegment()` /
`enforceSegmentEnd`:

- A (restart), S (snap-back), D (push-to-hear) start from the mark.
- Loop wrap (`enforceSegmentEnd`) returns to the mark.
- Count-in anchors its downbeat on the mark.
- One-shot mode plays mark → end once.

### Edge semantics

- **Mark outside the current effective segment** (loop/zoom cursor dragged past
  it, or zoom sub-region shrunk): the mark is *inert* — stored and rendered
  dimmed, but `resolveSegment` ignores it. No auto-delete, no auto-deactivate;
  moving the cursors back makes it live again.
- **Deactivating** (clicking the active mark) restores the whole loop.
- **Activation does not seek.** The restart keys start play from the mark; if
  audio is already playing it simply wraps to the mark at the next loop end.
- **Zoom off:** marks are invisible and inert; `marks`/`activeMark` are
  retained and resume when zoom reopens.
- Marks are absolute times; they do not shift when loop bounds change.

## Gestures and zoom-strip UI

All in `features/player-overlay/ZoomTimeline.tsx`.

| Gesture | Action |
| --- | --- |
| Shift+click empty track | Add mark at pointer time (scrub suppressed for that press) |
| Click marker | Toggle active — activate; clicking the active one deactivates |
| Shift+click marker | Remove (clears `activeMark` if it was the active one) |

- The track's `onTrackPointerDown` gains one gate: `event.shiftKey` → place a
  mark and skip the scrub path. Plain click/drag scrubs exactly as today.
- Shift+drag on the loop *cursors* (window-move mode) is unaffected — cursor
  buttons already swallow their own pointer events. Marker buttons follow the
  same discipline: `blockMouse` on mousedown/click, `stopPropagation`, and the
  `suppressNextClick` arming used by the cursors, so nothing leaks into
  YouTube's player.
- New props: `marks: number[]`, `activeMark: number | null`,
  `onAddMark(time)`, `onToggleMark(time)`, `onRemoveMark(time)`.

Visuals:

- Marker = slim vertical tick with a diamond head on the track; visually
  distinct from the bracket-shaped loop cursors.
- Idle: neutral. Active: accent fill. Inert (outside current loop bounds):
  dimmed ~40%.
- Active mark draws a subtle secondary fill from mark → loop end so the
  playing region is visible.
- Hover: time chip (reuse `you-loop-handle-chip`).
- Each mark is a `<button>` with `aria-pressed` for active state and label
  `Practice mark at <time>`.

## Persistence

`SavedLoop` (`features/persistence/loopStore.ts:16`) gains an optional field,
following the `countIn` pattern:

```ts
marks?: number[]; // absent on legacy loops — no migration needed
```

- `sanitizeEntry` also scrubs marks on every read: finite, `> 0`, deduped,
  sorted — a corrupt sync write can never reach playback (same boundary as
  `countIn`).
- `addLoop` and the `updateLoop` patch type accept `marks`. Saving or
  overwriting a loop snapshots the current marks; `applyLoop` restores them.
- `activeMark` is **not** persisted.
- Unsaved session: marks live until video change/reload, like an unsaved loop.
  A saved loop (including the auto-applied `lastUsedId`) brings its marks back.
- Storage size: an array of numbers per loop — negligible against sync quota.

## Help modal

One row in the gestures section of `HelpModal.tsx`: shift-click strip = add
mark; click mark = practice from there; click again = whole loop; shift-click
mark = remove.

## Testing

- `features/playback/marks.test.ts` — pure: add/remove/sort/dedupe;
  `resolveSegment` inside/outside/null/boundary (mark exactly at start or end
  of base → inert).
- `features/player-overlay/ZoomTimeline.test.tsx` — shift-click track adds a
  mark and does not scrub; click marker toggles active; shift-click marker
  removes; inert marks render dimmed; cursor shift-drag (window move) still
  works with marks present.
- `entrypoints/content/pageUi.test.tsx` — active mark swaps
  `effectiveSegment()` start (restart keys and loop wrap inherit it);
  deactivating restores the full loop; marks clear/reseed across video change.
- `features/persistence/loopStore.test.ts` — marks round-trip through
  save/apply; sanitize drops garbage; legacy loops without the field load
  cleanly.

## Out of scope

- Marks on the main YouTube progress bar.
- Numbered marks / number-key activation (explicitly scrubbed during
  brainstorm).
- Dragging markers to reposition.
- Marketing site / store screenshot updates (follow-up once shipped).
