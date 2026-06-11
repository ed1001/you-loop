# Loop Keyboard Shortcuts — Design

Date: 2026-06-11

## Goal

Add keyboard shortcuts for hands-on loop practice. Three actions, gated on the
loop being active:

- **Restart** — tap to jump the playhead to the loop start and play.
- **Punch-in (snap-back)** — held key plays the loop; releasing pauses and
  snaps back to the loop start.
- **Punch-in (push-to-hear)** — held key plays from the current playhead;
  releasing pauses and stays put (next press resumes from there).

## Key Bindings

| Key | Action |
|-----|--------|
| `a` | Restart (tap) |
| `s` | Punch-in snap-back (hold) |
| `d` | Punch-in push-to-hear (hold) |

Home-row cluster chosen for hold comfort (fingers rest on `a`/`s`/`d`). These
keys are not bound by YouTube, so nothing native is overridden.

## Architecture

New module `features/playback/shortcuts.ts` exporting:

```
createLoopKeyHandlers(deps): { onKeyDown(e), onKeyUp(e) }
```

The module is pure and DOM-agnostic apart from the injected video element, so it
unit-tests against a jsdom `HTMLVideoElement` with no React or document wiring.

`entrypoints/content/pageUi.tsx` owns lifecycle: it attaches `onKeyDown` /
`onKeyUp` to `document` (capture phase) on mount, removes them in `stop()`, and
supplies the closures below.

### Injected dependencies

- `video: HTMLVideoElement` — the target video.
- `getSegment(): LoopSegment | null` — returns `effectiveSegment()` (the zoom
  sub-region when zoomed, otherwise the main loop). `null` ⇒ all keys no-op.
- `isActive(): boolean` — returns `state.loopEnabled`.
- `resetOneShot(): void` — dispatches `markOneShotCompleted(false)` and
  re-renders, so a fresh pass plays cleanly in one-shot mode.

## Behavior

`start` / `end` are read from `getSegment()` at the moment the key fires.

| Key | keydown | keyup |
|-----|---------|-------|
| `a` restart | `resetOneShot()`; `currentTime = start`; `play()` | — |
| `s` snap-back (hold) | first press only: `resetOneShot()`; `currentTime = start`; `play()` | `pause()`; `currentTime = start` |
| `d` push-to-hear (hold) | first press only: `play()` (current position) | `pause()` (position unchanged) |

### Gating (applies to every key)

1. No-op unless `isActive()` is true **and** `getSegment()` is non-null.
2. No-op when `event.target` is an `<input>`, `<textarea>`, or a
   `contenteditable` element (e.g. the YouTube search box).
3. Handlers run in the **capture phase** so they act before YouTube's own
   handlers. For the three bound keys only, call `preventDefault()` and
   `stopPropagation()`. All other keys pass through untouched. When the loop is
   off, nothing is intercepted, so native YouTube shortcuts behave normally.

### Auto-repeat and key-state

Held keys ignore `event.repeat` — only the first `keydown` acts. The module
tracks a pressed-state flag per held key (`s`, `d`) so a duplicate or stuck
`keyup` is harmless (releasing an already-released key is a no-op).

### End-of-loop while held

No special handling. The existing `enforceSegmentEnd` (`features/playback/
controller.ts`), called on `timeupdate` while `loopEnabled` is true, already:

- **loop mode** — wraps back to the segment start at the end, and
- **one-shot mode** — pauses at the segment end.

This is reused as-is. `a` and `s` call `resetOneShot()` precisely so a prior
one-shot completion is cleared and the segment replays from the top.

## Testing

Unit tests on `shortcuts.ts` against a fake/jsdom video:

- `a` keydown seeks to `start` and plays; calls `resetOneShot`.
- `s` keydown plays from `start`; `s` keyup pauses and seeks to `start`.
- `d` keydown plays from current position; `d` keyup pauses without seeking.
- `event.repeat` keydown is ignored for held keys.
- All keys no-op when `isActive()` is false.
- All keys no-op when `getSegment()` returns `null`.
- All keys no-op when `event.target` is an input/textarea/contenteditable.
- Unbound keys are passed through (no `preventDefault`).

Existing `enforceSegmentEnd` tests already cover loop/one-shot end behavior.

## Out of Scope (YAGNI)

- No rebinding/configuration UI.
- No on-screen hint or shortcut overlay.
- No modifier-key combinations.
