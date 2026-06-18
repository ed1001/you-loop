# Loop Windowing — Move the Loop as a Fixed-Length Window

**Date:** 2026-06-18
**Status:** Approved (brainstorm) — ready for implementation plan

## Problem

Today the only way to reposition a loop is to drag each handle independently,
which changes the loop's length. The core practice move — master one bar, then
slide the loop to the next bar of the *same length* — is impossible without
re-dragging both handles and eyeballing the length.

## Goal

Let the user move the loop **as a fixed-length window**: slide it freely, or
hop it forward/back by exactly its own length ("goalpost march").

Two input paths:

- **Shift + handle drag** — hold Shift and drag either loop handle to slide both
  edges together (length preserved), instead of resizing that one edge. (The
  thin loop band itself is not reliably grabbable on YouTube's progress bar, so
  the handles carry the gesture. Shift = "window-level", matching `Shift+[`/`]`.)
- **Step / nudge keys** — `[`/`]` nudge the window back/forward by a small fixed
  amount; `Shift+[`/`Shift+]` jump it by one full length ("goalpost march").

Non-goals: on-screen step buttons; per-platform/site work beyond YouTube.

## Behaviour

### Length is preserved; the move is clamped, not the length

Moving the window never changes its duration. Near a boundary the *delta* is
clamped so the window slides flush to the edge and keeps its length; pushing
further is a no-op.

### A window move seeks to the new start

Moving the window (step/nudge keys, or a Shift+handle drag-on-release) seeks the
playhead to the **new window start** — so you can skip around and immediately
see/hear what is at each start point. The seek only fires when the start
actually changes: a boundary no-op step, or a Shift+drag with no movement, does
not seek. Play/pause state is left untouched — paused, you see the start frame;
playing, it auditions from the start.

This applies to **window moves only**. A plain (no-Shift) single-handle resize
that changes length does **not** seek — unchanged behaviour. A move of
the **main** loop commits through `setLoopSegment` (which re-clamps the zoom
sub-region); a move of the **zoom sub-region** seeks within it.

### Two regions, two clamp bounds

The extension tracks two regions (see `entrypoints/content/pageUi.tsx`):

- the **main loop** (`state.loopSegment`), and
- the **zoom sub-region** (`zoomLoop`), which always lives *inside* the main
  loop via `clampLoopToRegion`.

`effectiveSegment()` is the zoom sub-region while magnified, otherwise the main
loop. The window move acts on whichever is active, with the matching bounds:

| Active region            | Move bounds                          |
|--------------------------|--------------------------------------|
| Main loop (not zoomed)   | `[0, duration]`                      |
| Zoom sub-region (zoomed) | `[mainLoop.start, mainLoop.end]`     |

When a move shifts the **main loop**, the zoom sub-region is re-clamped into the
new main loop — exactly as `onMainLoopChange` already does.

### Surfaces

- **Main timeline:** Shift+handle drag + step/nudge keys.
- **Zoom panel:** Shift+cursor drag + step/nudge keys. The zoom loop cursors get
  the same Shift→window gesture as the main handles (clamped to the zoom window,
  which equals the main loop). The zoom track BODY (`you-loop-zoom-track`) stays
  the playhead-scrub surface — only the cursors carry the window gesture.
  Stepping/nudging while zoomed moves the zoom sub-region (keys route through
  `effectiveSegment`).

## Architecture

Approach: one pure helper, fed by both input paths. No new reducer command —
the reducer has no `duration` or zoom-region knowledge, and adding bounds there
would break the pure-playback boundary (`features/playback` stays DOM-free and
context-free per AGENTS.md).

### Unit: `translateSegment` (pure)

New file `features/playback/translateSegment.ts`.

```
translateSegment(
  segment: LoopSegment,
  delta: number,
  bounds: { min: number; max: number }
): LoopSegment
```

- `len = segment.end - segment.start` — preserved exactly in the result.
- `maxStart = Math.max(bounds.min, bounds.max - len)`
- `newStart = clamp(segment.start + delta, bounds.min, maxStart)`
- `newEnd = newStart + len`
- Both rounded to 3 decimals (matches `normalizeLoopSegment`).

Depends on: `LoopSegment` type only. No DOM, no state. Fully unit-testable.

Degenerate guard: if `len >= bounds.max - bounds.min` (window as wide as / wider
than its bounds — shouldn't occur, since the zoom region is clamped inside the
main loop and the main loop inside the timeline), `maxStart` collapses to
`bounds.min`, so the window pins to the low edge and keeps its length.

### Constants

In `features/playback/reducer.ts`, alongside the existing playback constants
(`MIN_SEGMENT_DURATION_SECONDS`, `MIN_PLAYBACK_RATE`, …):

- `NUDGE_SECONDS = 1.0` — fine-nudge delta. Tunable.
- Step delta is computed at the call site as `±len`, not a constant.

### Input path A — Shift + handle drag (`features/player-overlay/TimelineHandles.tsx`)

The whole-window drag rides on the existing start/end handle drags, gated by
Shift held at pointerdown — not on the (ungrabbable) band.

- A per-drag mode captured at pointerdown: `event.shiftKey` → `"window"` mode,
  else `"resize"` mode (the existing behaviour).
- In `"window"` mode, capture the grab time (`valueFromPointer(clientX)`) and the
  committed segment at grab, exactly as the handle drag already captures state.
- On move in `"window"` mode: `delta = pointerTime - grabTime`;
  `live = translateSegment(grabSegment, delta, { min: 0, max: safeDuration })`;
  paint `live`. In `"resize"` mode, the existing `clampSegment` path is unchanged.
- On drop: in `"window"` mode, if the start actually changed, commit via a
  distinct `onWindowMove` prop (so pageUi seeks to the new start); if it didn't
  change, commit via `onSegmentChange` (no seek). In `"resize"` mode, always
  commit via `onSegmentChange` (never seeks). `onWindowMove` falls back to
  `onSegmentChange` when not provided.
- Either handle works — Shift mode is per-drag, independent of which handle is
  grabbed.

The loop band (`.you-loop-loop-range`) stays a non-interactive visual marker
(`pointer-events: none`, no grab cursor) — reverting the earlier draggable-band
CSS.

The **zoom loop cursors** (`features/player-overlay/ZoomTimeline.tsx`) get the
identical Shift→window gesture: a `dragMode` captured from `event.shiftKey` at
cursor pointerdown, `translateSegment` of the whole zoom loop clamped to the zoom
window (`{ min: win.start, max: win.end }`, which equals the main loop), and an
`onWindowMove` commit path that seeks. Plain (no-Shift) cursor drags still resize
one edge via `onLoopChange`. The playhead-scrub on the track body is untouched.

### Input path B — step / nudge keys (`features/playback/shortcuts.ts` + pageUi)

- New keys matched by **`event.code`** — `BracketRight` (`]`) and `BracketLeft`
  (`[`) — because Shift changes `event.key` (`[` → `{`) but not `event.code`.
  The existing `a`/`s`/`d` continue to match on `event.key`.
- Mapping (active region from `getSegment()`, `len = end - start`):
  - `]` → `moveActiveWindow(+NUDGE_SECONDS)`,  `[` → `moveActiveWindow(-NUDGE_SECONDS)`
  - `Shift+]` → `moveActiveWindow(+len)`,  `Shift+[` → `moveActiveWindow(-len)`
  - (bare = small nudge; Shift = full-length jump)
- Gated by the existing `resolveEvent` (typing target, `isActive()`, non-null
  segment).
- **OS auto-repeat is allowed** for the bracket keys (hold `]` to march the
  window forward repeatedly) — unlike the press-and-hold `a`/`s`/`d`, which are
  guarded against repeat. The bracket keys are discrete actions, so they are not
  added to the `held` set.
- New dependency on `LoopKeyDeps`: `moveActiveWindow(delta: number): void`.

New pageUi `moveActiveWindow(delta)`:

- If zoomed and `zoomLoop != null`:
  `zoomLoop = translateSegment(zoomLoop, delta, { min: mainLoop.start, max: mainLoop.end })`;
  the existing zoom-change render path; then seek (below).
- Else, with `state.loopSegment != null`:
  `setLoopSegment(translateSegment(loopSegment, delta, { min: 0, max: duration }))`,
  re-clamp `zoomLoop` into the new main loop, render (same body as
  `onMainLoopChange`); then seek (below).
- No-op when there is no active segment.
- **Seek:** after committing, if the moved segment's `start` differs from the
  pre-move start, set `video.currentTime = movedStart`. The band drag-on-release
  path does the same via `onWindowMove`. Play/pause is left untouched.

## Discoverability

- **Help modal:** rows for `[` / `]` (nudge window) and `Shift+[` / `Shift+]`
  (step window by its length), AND a row documenting the **Shift+drag** gesture
  (hold Shift and drag a loop handle/cursor to slide the whole loop).
- **CONTEXT.md:** add a domain term for the gesture (e.g. **Window Shift** — move
  a Loop Segment without changing its length). Keep it short.

## Testing

- **`translateSegment` (unit):** mid-range move; clamp at min and at max (flush,
  length preserved); delta larger than available room; negative delta; zoom
  bounds (non-zero min); length preserved exactly; 3dp rounding; degenerate
  window-wider-than-bounds guard.
- **`shortcuts` (unit):** `]`/`[` call `moveActiveWindow` with `±NUDGE_SECONDS`;
  `Shift+]`/`Shift+[` with `±len`; matching works under Shift (via `event.code`);
  gated off when typing / inactive / null segment; auto-repeat produces repeated
  moves.
- **pageUi (integration, `pageUi.test.tsx`):** `moveActiveWindow` routes to the
  main loop when not zoomed and to the zoom sub-region when zoomed; moving the
  main loop re-clamps the zoom sub-region.
- **`TimelineHandles` (component):** a Shift+handle drag translates both edges by
  the same delta and commits via `onWindowMove`; clamps flush at both timeline
  edges; a plain (no-Shift) handle drag still resizes one edge via
  `onSegmentChange` and does not move the window.
- **`ZoomTimeline` (component):** a Shift+cursor drag translates the whole zoom
  loop and commits via `onWindowMove`; a plain cursor drag still resizes one edge
  via `onLoopChange`; the playhead scrub on the track body is unaffected.

## Files touched

- `features/playback/translateSegment.ts` (new) + test
- `features/playback/reducer.ts` (export `NUDGE_SECONDS`)
- `features/playback/shortcuts.ts` + test
- `features/player-overlay/TimelineHandles.tsx` + test
- `entrypoints/content/pageUi.tsx` (`moveActiveWindow`, wire into
  `createLoopKeyHandlers` deps)
- `entrypoints/content/pageUi.styles.ts` (`.you-loop-loop-range` cursor +
  pointer-events)
- Help modal component (shortcut rows)
- `CONTEXT.md` (domain term)
