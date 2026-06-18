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

- **Free drag** — grab the highlighted loop band on the main timeline and slide
  both edges together, length preserved.
- **Step / nudge keys** — `[`/`]` nudge the window back/forward by a small fixed
  amount; `Shift+[`/`Shift+]` jump it by one full length ("goalpost march").

Non-goals: on-screen step buttons; per-platform/site work beyond YouTube.

## Behaviour

### Length is preserved; the move is clamped, not the length

Moving the window never changes its duration. Near a boundary the *delta* is
clamped so the window slides flush to the edge and keeps its length; pushing
further is a no-op.

### A window move seeks to the new start

Moving the window (step/nudge keys, or a band drag-on-release) seeks the
playhead to the **new window start** — so you can skip around and immediately
see/hear what is at each start point. The seek only fires when the start
actually changes: a boundary no-op step, or a band click with no movement, does
not seek. Play/pause state is left untouched — paused, you see the start frame;
playing, it auditions from the start.

This applies to **window moves only**. Single-handle resizes (dragging the start
or end handle to change length) do **not** seek — unchanged behaviour. A move of
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

- **Main timeline:** band drag + step/nudge keys.
- **Zoom panel:** keys only. The zoom track body (`you-loop-zoom-track`) is
  already the playhead-scrub surface, so it is NOT repurposed for window drag.
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

### Input path A — main band drag (`features/player-overlay/TimelineHandles.tsx`)

- Extend the `Handle` union with `"range"`.
- Give the existing `rangeRef` band the same pointer machinery the handles use:
  `setPointerCapture`, direct-DOM `paint`, `finishDrag`, `onLostPointerCapture`,
  `onPointerCancel`, `suppressNextClick`, and `blockMouse` on mousedown/click
  (to keep YouTube's scrubber from reacting).
- On range pointerdown: capture the grab time (`valueFromPointer(clientX)`) and
  the committed segment at grab.
- On range pointermove: `delta = pointerTime - grabTime`;
  `live = translateSegment(grabSegment, delta, { min: 0, max: safeDuration })`;
  paint `live`.
- On drop: if the start actually changed, commit `live` via a distinct
  `onWindowMove` prop (so pageUi can seek to the new start); otherwise (a click
  with no movement) commit via `onSegmentChange` with no seek. `onWindowMove`
  falls back to `onSegmentChange` when not provided.
- The per-handle (`start`/`end`) branches are unchanged: they commit via
  `onSegmentChange` and never seek; only the `"range"` branch uses
  `translateSegment` and routes through `onWindowMove`.

CSS (`entrypoints/content/pageUi.styles.ts`, `.you-loop-loop-range`):
`cursor: grab; pointer-events: auto;` and a `grabbing` cursor while dragging.

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

- **Help modal:** add rows for `[` / `]` (nudge window) and `Shift+[` /
  `Shift+]` (step window by its length).
- **CONTEXT.md:** add a domain term for the gesture (e.g. **Window Shift** — move
  a Loop Segment without changing its length). Keep it short.

## Testing

- **`translateSegment` (unit):** mid-range move; clamp at min and at max (flush,
  length preserved); delta larger than available room; negative delta; zoom
  bounds (non-zero min); length preserved exactly; 3dp rounding; degenerate
  window-wider-than-bounds guard.
- **`shortcuts` (unit):** `]`/`[` call `moveActiveWindow` with `±len`;
  `Shift+]`/`Shift+[` with `±NUDGE_SECONDS`; matching works under Shift (via
  `event.code`); gated off when typing / inactive / null segment; auto-repeat
  produces repeated moves.
- **pageUi (integration, `pageUi.test.tsx`):** `moveActiveWindow` routes to the
  main loop when not zoomed and to the zoom sub-region when zoomed; moving the
  main loop re-clamps the zoom sub-region.
- **`TimelineHandles` (component):** band drag translates both edges by the same
  delta and commits; clamps flush at both timeline edges; per-handle drags are
  unaffected.

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
