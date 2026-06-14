# Compact panel for small players — design

## Problem

The loop panel is a horizontal pill mounted below YouTube's progress bar
(`.you-loop-panel`). Fully enabled it is ~360px wide (power · Loop/One-shot
segmented · speed chip · zoom · loops · help). On narrow players — small
browser windows, the default non-theater layout, and YouTube's miniplayer —
the pill overflows the available width and the outer controls spill past the
player edges.

We want a compact form that keeps every control visible but fits narrow
players.

## Decisions

- **Compact form: icon-only row.** No hidden controls, no overflow menu, no
  stacking. The only markup that changes is the mode control: the
  `Loop | One-shot` text segment becomes a single icon toggle. Everything else
  stays on one row, just smaller and tighter.
- **Trigger: player width via `ResizeObserver`.** Robust across small window,
  non-theater view, and miniplayer (a viewport media query would miss a small
  player inside a wide window).
- **Mechanism: DOM dataset + CSS**, mirroring the existing `watchAutohide`
  helper. Width never enters the React render path — no new prop, no extra
  re-renders.

## Architecture

### Trigger / state — `entrypoints/content/pageUi.tsx`

New helper `watchPlayerWidth(panel, ...)` modeled on `watchAutohide`:

- `ResizeObserver` on the page-ui `panel` element (it has `inset: 0` and spans
  the player's content width).
- Computes the next compact state and writes `panel.dataset.compact =
  "true" | "false"`. Writes only when the value flips, so rapid resize events
  don't thrash the DOM.
- Wired in `createPageUiElement` alongside `stopAutohide`; its disconnect runs
  in the mounted UI's `cleanup`.
- Player missing → no-op (`return () => {}`); panel stays in full form, matching
  current behavior.

Hysteresis to stop oscillation when a pill sits right at the boundary:

- Enter compact at width **< 480px**.
- Exit compact at width **≥ 500px** (20px dead band).

Extracted as a pure function for testing:

```ts
// returns the next compact flag given current width and previous flag
function nextCompactState(width: number, prev: boolean): boolean {
  if (prev) return width < 500;   // stay compact until clearly wide
  return width < 480;             // become compact once clearly narrow
}
```

### Markup — `features/player-overlay/LoopPanel.tsx`

Only the mode control gains a variant. Add a compact-only icon button
`.you-loop-mode-compact` as a sibling of the existing `.you-loop-modes`
segmented group, inside `.you-loop-cluster-inner`. Both are always present in
the DOM; CSS shows exactly one based on the `[data-compact]` ancestor.

- Calls the same `onToggleMode` handler.
- `data-mode={mode}` drives the icon and `aria-label`:
  - `loop` → repeat glyph (two arrows in a loop), label "Switch to one-shot".
  - `one-shot` → single-arrow glyph, label "Switch to loop".
- Disabled (and dimmed) while the loop is off, same as `.you-loop-modes`.
- SVG style matches the other panel icons (`viewBox="0 0 24 24"`, stroked,
  `currentColor`).

No other control's markup changes.

### CSS — append to `PAGE_UI_STYLES` in `pageUi.styles.ts`

All rules gated on `.you-loop-page-ui[data-compact="true"]`:

- Circular buttons (`.you-loop-power`, `.you-loop-zoom-toggle`,
  `.you-loop-loops-toggle`, `.you-loop-help-toggle`) 30→26px; their SVGs scale
  proportionally.
- `.you-loop-panel` gap 6→4px, padding 4→3px.
- Hide `.you-loop-modes`; show `.you-loop-mode-compact`.
  In the full form (`[data-compact="false"]` / default) hide
  `.you-loop-mode-compact`.
- Hide `.you-loop-wordmark` and collapse `.you-loop-wordmark-slot` to width 0,
  so the off (disabled) state is just power + help — tiny.
- Speed chip kept as-is (already ~44px).

Resulting enabled width ≈ 200–210px, fitting players down to ~260px; the 480px
threshold leaves comfortable margin.

## Data flow

Player width lives only in `panel.dataset.compact`. CSS reacts to it. The React
`render()` path and `LoopPanel` props are untouched — identical shape to
`watchAutohide`, which already drives `panel.dataset.hidden` the same way.

## Error handling / edge cases

- Player element not found when wiring the observer → no-op, full form.
- Rapid `ResizeObserver` bursts → hysteresis band + write-on-change-only avoid
  flapping and DOM churn.
- Fullscreen / theater → wide → full form. Miniplayer / narrow window →
  compact. Crossing the band switches once, cleanly.
- Reduced-motion: no new animation introduced; existing
  `prefers-reduced-motion` rule still applies to the pill's expand/collapse.

## Testing

- **Unit (vitest):** `nextCompactState` — below 480 from full → true; in
  [480,500) holds previous state (both directions); ≥500 from compact → false;
  exact boundaries 480 and 500.
- **Manual:** on a watch page, narrow the window past the threshold and back;
  open the miniplayer; toggle theater/fullscreen. Verify: pill fits without
  spilling, mode icon reflects and toggles loop/one-shot, off-state pill is
  small (power + help only), full form returns when wide.
