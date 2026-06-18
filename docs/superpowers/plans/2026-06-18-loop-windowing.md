# Loop Windowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user move the loop as a fixed-length window — drag the highlighted band on the main timeline, or step/nudge it with `[` / `]` (and Shift variants).

**Architecture:** One pure helper, `translateSegment`, slides a `LoopSegment` by a delta with length preserved and the *move* clamped to bounds. Two input paths feed it: the main-timeline band drag (in `TimelineHandles`) and the bracket keys (in `shortcuts.ts` → a new pageUi `moveActiveWindow` router). The router picks the active region (main loop vs zoom sub-region) and its bounds. No new reducer command — `features/playback` stays DOM-free and context-free.

**Tech Stack:** TypeScript, React (overlay UI), WXT extension, Vitest + Testing Library, pnpm.

## Global Constraints

- Package manager is **pnpm** — never npm/yarn.
- Keep DOM/YouTube access in `adapters/youtube`; keep `features/playback` pure (no DOM beyond a passed `<video>`, no extension/context state); UI in `features/player-overlay`.
- Never edit `.output/` or `.wxt/` (generated).
- Commit messages end with the repo's `Co-Authored-By` / `Claude-Session` trailers (match recent history). A `fallow audit` gate runs on commit — if it fails, fix and re-commit.
- Round segment times to 3 decimals, matching `normalizeLoopSegment`.

---

### Task 1: `translateSegment` pure helper

**Files:**
- Create: `features/playback/translateSegment.ts`
- Test: `features/playback/translateSegment.test.ts`

**Interfaces:**
- Consumes: `LoopSegment` from `features/playback/types.ts` (`{ start: number; end: number }`).
- Produces:
  - `type MoveBounds = { min: number; max: number }`
  - `translateSegment(segment: LoopSegment, delta: number, bounds: MoveBounds): LoopSegment`

- [ ] **Step 1: Write the failing tests**

Create `features/playback/translateSegment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { translateSegment } from "./translateSegment";

const bounds = { min: 0, max: 120 };

describe("translateSegment", () => {
  it("slides both ends by delta, preserving length", () => {
    expect(translateSegment({ start: 20, end: 40 }, 10, bounds)).toEqual({
      start: 30,
      end: 50
    });
  });

  it("slides backward with a negative delta", () => {
    expect(translateSegment({ start: 20, end: 40 }, -5, bounds)).toEqual({
      start: 15,
      end: 35
    });
  });

  it("clamps flush at the upper bound, keeping length", () => {
    expect(translateSegment({ start: 100, end: 110 }, 50, bounds)).toEqual({
      start: 110,
      end: 120
    });
  });

  it("clamps flush at the lower bound, keeping length", () => {
    expect(translateSegment({ start: 10, end: 30 }, -50, bounds)).toEqual({
      start: 0,
      end: 20
    });
  });

  it("clamps within non-zero bounds (zoom sub-region)", () => {
    expect(
      translateSegment({ start: 50, end: 60 }, 100, { min: 40, max: 80 })
    ).toEqual({ start: 70, end: 80 });
  });

  it("rounds to 3 decimals", () => {
    expect(translateSegment({ start: 1, end: 2 }, 0.0001, bounds)).toEqual({
      start: 1,
      end: 2
    });
  });

  it("pins to the low edge when the window is as wide as its bounds", () => {
    expect(
      translateSegment({ start: 0, end: 40 }, 10, { min: 0, max: 40 })
    ).toEqual({ start: 0, end: 40 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- translateSegment`
Expected: FAIL — `translateSegment` is not defined / module not found.

- [ ] **Step 3: Write the implementation**

Create `features/playback/translateSegment.ts`:

```ts
import type { LoopSegment } from "./types";

export type MoveBounds = { min: number; max: number };

// Slide a loop segment by `delta` seconds without changing its length. The move
// (not the length) is clamped: near a bound the window slides flush to the edge
// and keeps its length; pushing further is a no-op. `bounds` is [0, duration]
// for the main loop, or the main loop's [start, end] for the zoom sub-region.
export function translateSegment(
  segment: LoopSegment,
  delta: number,
  bounds: MoveBounds
): LoopSegment {
  const len = segment.end - segment.start;
  const maxStart = Math.max(bounds.min, bounds.max - len);
  const start = Math.min(maxStart, Math.max(bounds.min, segment.start + delta));
  return {
    start: Number(start.toFixed(3)),
    end: Number((start + len).toFixed(3))
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- translateSegment`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/playback/translateSegment.ts features/playback/translateSegment.test.ts
git commit -m "feat(playback): add translateSegment for fixed-length window moves

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LcgTf4djohFcr6ZFX4V5QK"
```

---

### Task 2: Step / nudge keys in `shortcuts.ts`

**Files:**
- Modify: `features/playback/reducer.ts` (add `NUDGE_SECONDS` constant)
- Modify: `features/playback/shortcuts.ts`
- Test: `features/playback/shortcuts.test.ts`

**Interfaces:**
- Consumes: `NUDGE_SECONDS` from `reducer.ts`; existing `LoopKeyDeps` shape.
- Produces: new required field on `LoopKeyDeps`: `moveActiveWindow: (delta: number) => void`. Bracket keys call it with `±len` (full window) or `±NUDGE_SECONDS` (Shift), where `len = segment.end - segment.start`.

- [ ] **Step 1: Add the `NUDGE_SECONDS` constant**

In `features/playback/reducer.ts`, below `PLAYBACK_RATE_STEP` (line 13):

```ts
// Fine-nudge distance for Shift+[ / Shift+] window moves, in seconds. Tunable.
export const NUDGE_SECONDS = 1.0;
```

- [ ] **Step 2: Write the failing tests**

In `features/playback/shortcuts.test.ts`, extend the `keyEvent` helper to carry `code` and `shiftKey`, add `moveActiveWindow` to `setup`'s deps, and add a `describe` block. First, change the `keyEvent` helper (it already spreads `overrides`, so `code`/`shiftKey` flow through — add explicit defaults so unset cases are deterministic):

```ts
function keyEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key,
    code: "",
    shiftKey: false,
    repeat: false,
    target: document.body,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides
  } as unknown as KeyboardEvent;
}
```

Change `setup` to expose a `moveActiveWindow` spy:

```ts
function setup(depsOverrides: Partial<LoopKeyDeps> = {}) {
  const vid = video();
  const resetOneShot = vi.fn();
  const moveActiveWindow = vi.fn();
  const segment: LoopSegment = { start: 5, end: 8 };
  const deps: LoopKeyDeps = {
    video: vid,
    getSegment: () => segment,
    isActive: () => true,
    resetOneShot,
    moveActiveWindow,
    ...depsOverrides
  };
  return { vid, resetOneShot, moveActiveWindow, handlers: createLoopKeyHandlers(deps) };
}
```

Add the new tests (segment is `{start:5,end:8}`, so `len === 3`):

```ts
describe("window step/nudge keys", () => {
  it("] steps the window forward by its own length", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    expect(moveActiveWindow).toHaveBeenCalledWith(3);
  });

  it("[ steps the window backward by its own length", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("[", { code: "BracketLeft" }));
    expect(moveActiveWindow).toHaveBeenCalledWith(-3);
  });

  it("Shift+] nudges forward by NUDGE_SECONDS (matched via code under shift)", () => {
    const { moveActiveWindow, handlers } = setup();
    // Shift turns the key into "}", but event.code stays BracketRight.
    handlers.onKeyDown(keyEvent("}", { code: "BracketRight", shiftKey: true }));
    expect(moveActiveWindow).toHaveBeenCalledWith(NUDGE_SECONDS);
  });

  it("Shift+[ nudges backward by NUDGE_SECONDS", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("{", { code: "BracketLeft", shiftKey: true }));
    expect(moveActiveWindow).toHaveBeenCalledWith(-NUDGE_SECONDS);
  });

  it("repeats on OS auto-repeat (hold to march)", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight", repeat: true }));
    expect(moveActiveWindow).toHaveBeenCalledTimes(2);
  });

  it("is inert when the loop is off", () => {
    const { moveActiveWindow, handlers } = setup({ isActive: () => false });
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    expect(moveActiveWindow).not.toHaveBeenCalled();
  });

  it("is inert when there is no active segment", () => {
    const { moveActiveWindow, handlers } = setup({ getSegment: () => null });
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    expect(moveActiveWindow).not.toHaveBeenCalled();
  });

  it("ignores brackets while typing", () => {
    const { moveActiveWindow, handlers } = setup();
    const input = document.createElement("input");
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight", target: input }));
    expect(moveActiveWindow).not.toHaveBeenCalled();
  });
});
```

Add the import at the top of the test file:

```ts
import { NUDGE_SECONDS } from "./reducer";
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- shortcuts`
Expected: FAIL — `moveActiveWindow` not in `LoopKeyDeps` type / brackets not handled (spy never called).

- [ ] **Step 4: Implement the key handling**

In `features/playback/shortcuts.ts`:

Add the import below the existing imports (line 1):

```ts
import { NUDGE_SECONDS } from "./reducer";
```

Add `moveActiveWindow` to `LoopKeyDeps` (after `resetOneShot`):

```ts
  // Clears a prior one-shot completion so the segment replays from the top.
  resetOneShot: () => void;
  // Move the active region (zoom sub-region when zoomed, else the main loop) by
  // `delta` seconds, length preserved. The caller picks the clamp bounds.
  moveActiveWindow: (delta: number) => void;
```

Add a code set near the existing `HANDLED_KEYS` (line 22):

```ts
// Bracket keys move the window; matched by event.code so Shift (which turns
// "[" into "{") doesn't change the match.
const STEP_CODES = new Set(["BracketLeft", "BracketRight"]);
```

At the very top of `onKeyDown` (before `const key = event.key.toLowerCase();`), insert:

```ts
  const onKeyDown = (event: KeyboardEvent) => {
    if (STEP_CODES.has(event.code)) {
      const segment = resolveEvent(event);
      if (segment == null) return;
      const dir = event.code === "BracketRight" ? 1 : -1;
      const len = segment.end - segment.start;
      deps.moveActiveWindow(event.shiftKey ? dir * NUDGE_SECONDS : dir * len);
      return;
    }

    const key = event.key.toLowerCase();
    if (!HANDLED_KEYS.has(key)) return;
    // ... existing body unchanged ...
```

(The bracket branch runs before the `HANDLED_KEYS` early-return and is not added to the `held` set, so OS auto-repeat keeps firing — the "march" behaviour. `resolveEvent` already gates typing/inactive/null and calls preventDefault/stopPropagation only when it decides to handle.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- shortcuts`
Expected: PASS (existing tests + 8 new).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `pageUi.tsx` now passes a `LoopKeyDeps` missing `moveActiveWindow`. That is wired in Task 3; this is expected. (If you want a green typecheck before committing, do Task 3 Step 1 first, then commit both. Otherwise commit now and let Task 3 close the gap.)

- [ ] **Step 7: Commit**

```bash
git add features/playback/reducer.ts features/playback/shortcuts.ts features/playback/shortcuts.test.ts
git commit -m "feat(playback): [ and ] step/nudge the loop window via shortcuts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LcgTf4djohFcr6ZFX4V5QK"
```

---

### Task 3: Wire `moveActiveWindow` in pageUi

**Files:**
- Modify: `entrypoints/content/pageUi.tsx`
- Test: `entrypoints/content/pageUi.test.tsx`

**Interfaces:**
- Consumes: `translateSegment` (Task 1); the `moveActiveWindow` dep slot on `LoopKeyDeps` (Task 2); existing `onMainLoopChange`, `effectiveSegment`, `state.loopSegment`, `zoomed`, `zoomLoop`, `getVideoDuration(video)`.
- Produces: a `moveActiveWindow(delta: number)` closure passed into `createLoopKeyHandlers`.

- [ ] **Step 1: Add the import**

In `entrypoints/content/pageUi.tsx`, with the other `features/playback` imports:

```ts
import { translateSegment } from "../../features/playback/translateSegment";
```

- [ ] **Step 2: Add the `moveActiveWindow` closure**

Place it directly after `onZoomLoopChange` (around line 219):

```ts
  // Move the active loop window by `delta` seconds, length preserved. While
  // magnified it slides the zoom sub-region inside the main loop; otherwise it
  // slides the main loop within the timeline (which re-clamps the zoom
  // sub-region, via onMainLoopChange). No seek — loop enforcement pulls the
  // playhead in on the next wrap, exactly as a handle drag does.
  const moveActiveWindow = (delta: number) => {
    if (zoomed && zoomLoop != null && state.loopSegment != null) {
      onZoomLoopChange(
        translateSegment(zoomLoop, delta, {
          min: state.loopSegment.start,
          max: state.loopSegment.end
        })
      );
      return;
    }
    if (state.loopSegment == null) return;
    onMainLoopChange(
      translateSegment(state.loopSegment, delta, {
        min: 0,
        max: getVideoDuration(video)
      })
    );
  };
```

- [ ] **Step 3: Pass it into the key handlers**

In the `createLoopKeyHandlers({ ... })` call (around line 527), add the field:

```ts
  const keyHandlers = createLoopKeyHandlers({
    video,
    getSegment: effectiveSegment,
    isActive: () => state.loopEnabled,
    moveActiveWindow,
    resetOneShot: () => {
      state = playbackReducer(state, {
        type: "markOneShotCompleted",
        completed: false
      });
      render();
    }
  });
```

- [ ] **Step 4: Write the failing integration test**

In `entrypoints/content/pageUi.test.tsx`, add this test inside the `describe("page UI", ...)` block. It stubs the timeline rect (jsdom rects are 0-width) so a handle drag yields real times, drags the loop to `20–40`, then presses `]` and asserts the band moved to `40–60` with unchanged width.

```ts
  it("] steps the main loop window forward by its length", () => {
    const { player, progressBar } = mountWithLoopEnabled();

    const timeline = player.querySelector(
      "[data-testid='timeline-handles']"
    ) as HTMLElement;
    // 1px == 1s so pointer clientX maps directly to seconds (duration is 120).
    timeline.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;

    const startHandle = screen.getByLabelText("Loop start");
    const endHandle = screen.getByLabelText("Loop end");

    // Drag handles to make a 20–40 loop.
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 0 });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 20 });
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 20 });
    });
    act(() => {
      fireEvent.pointerDown(endHandle, { pointerId: 2, clientX: 120 });
      fireEvent.pointerMove(endHandle, { pointerId: 2, clientX: 40 });
      fireEvent.pointerUp(endHandle, { pointerId: 2, clientX: 40 });
    });

    const band = player.querySelector(".you-loop-loop-range") as HTMLElement;
    expect(band.style.left).toBe("16.666666666666664%"); // 20/120
    expect(band.style.width).toBe("16.666666666666664%"); // (40-20)/120

    // Press ] — steps forward by len (20s) to 40–60.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "BracketRight", bubbles: true })
      );
    });

    expect(band.style.left).toBe("33.33333333333333%"); // 40/120
    expect(band.style.width).toBe("16.666666666666664%"); // unchanged
  });
```

> Note: the exact percentage strings come from `start / 120 * 100`. If your environment prints a different float repr, read the value the test reports on first run and pin it — the invariant under test is *left increased by one window-length, width unchanged*, not the literal digits.

- [ ] **Step 5: Run the test to verify it fails, then passes**

Run: `pnpm test -- pageUi`
First (before Steps 1–3 are saved): FAIL. After Steps 1–3: re-run, Expected: PASS.

- [ ] **Step 6: Full typecheck + suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (the Task 2 type gap is now closed).

- [ ] **Step 7: Commit**

```bash
git add entrypoints/content/pageUi.tsx entrypoints/content/pageUi.test.tsx
git commit -m "feat(overlay): route window step/nudge keys to the active region

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LcgTf4djohFcr6ZFX4V5QK"
```

---

### Task 4: Main-timeline band drag

**Files:**
- Modify: `features/player-overlay/TimelineHandles.tsx`
- Modify: `entrypoints/content/pageUi.styles.ts` (`.you-loop-loop-range`)
- Test: `features/player-overlay/TimelineHandles.test.tsx` (new)

**Interfaces:**
- Consumes: `translateSegment` (Task 1); existing `onSegmentChange(segment: LoopSegment)` prop.
- Produces: the `.you-loop-loop-range` band is now a drag target that slides the whole window and commits via `onSegmentChange`. (No new exports.)

- [ ] **Step 1: Write the failing component test**

Create `features/player-overlay/TimelineHandles.test.tsx`:

```ts
import { act } from "react";
import { render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineHandles } from "./TimelineHandles";

// jsdom lacks PointerEvent; a MouseEvent subclass carries clientX/pointerId.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  // @ts-expect-error test shim
  window.PointerEvent = PointerEventShim;
}

function setup() {
  const onSegmentChange = vi.fn();
  const utils = render(
    <TimelineHandles
      duration={120}
      segment={{ start: 20, end: 40 }}
      onSegmentChange={onSegmentChange}
    />
  );
  const timeline = utils.getByTestId("timeline-handles") as HTMLElement;
  // 1px == 1s.
  timeline.getBoundingClientRect = () =>
    ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const band = timeline.querySelector(".you-loop-loop-range") as HTMLElement;
  return { onSegmentChange, timeline, band };
}

describe("TimelineHandles band drag", () => {
  it("slides the whole window by the drag delta, length preserved", () => {
    const { onSegmentChange, band } = setup();
    act(() => {
      fireEvent.pointerDown(band, { pointerId: 1, clientX: 30 }); // grab at t=30
      fireEvent.pointerMove(band, { pointerId: 1, clientX: 50 }); // +20s
      fireEvent.pointerUp(band, { pointerId: 1, clientX: 50 });
    });
    expect(onSegmentChange).toHaveBeenLastCalledWith({ start: 40, end: 60 });
  });

  it("clamps the window flush at the timeline end, keeping length", () => {
    const { onSegmentChange, band } = setup();
    act(() => {
      fireEvent.pointerDown(band, { pointerId: 1, clientX: 30 });
      fireEvent.pointerMove(band, { pointerId: 1, clientX: 200 }); // way past end
      fireEvent.pointerUp(band, { pointerId: 1, clientX: 200 });
    });
    expect(onSegmentChange).toHaveBeenLastCalledWith({ start: 100, end: 120 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- TimelineHandles`
Expected: FAIL — the band has no pointer handlers, `onSegmentChange` never called.

- [ ] **Step 3: Add `translateSegment` import + `"range"` handle**

In `features/player-overlay/TimelineHandles.tsx`:

Add the import (after the `types` import, line 2):

```ts
import { translateSegment } from "../playback/translateSegment";
```

Widen the `Handle` type (line 12):

```ts
type Handle = "start" | "end" | "range";
```

Add grab-origin refs next to `liveRef` (after line 42):

```ts
  // For a "range" (whole-window) drag: the pointer time and segment captured at
  // grab, so each move is a delta from the grab point rather than absolute.
  const grabTimeRef = useRef(0);
  const grabSegRef = useRef<LoopSegment>(committed);
```

- [ ] **Step 4: Branch the drag math for `"range"`**

Replace the body of `applyHandleFromPointer` (lines 108-120) so a `"range"` drag translates the whole window:

```ts
  const applyHandleFromPointer = (
    handle: Handle,
    event: PointerEvent<HTMLButtonElement> | PointerEvent<HTMLDivElement>
  ): boolean => {
    if (draggingRef.current !== handle) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if (handle === "range") {
      const delta = valueFromPointer(event.clientX) - grabTimeRef.current;
      liveRef.current = translateSegment(grabSegRef.current, delta, {
        min: 0,
        max: safeDuration
      });
    } else {
      const value = valueFromPointer(event.clientX);
      liveRef.current = clampSegment(handle, value, liveRef.current);
    }
    return true;
  };
```

- [ ] **Step 5: Capture the grab origin on range pointerdown**

In `createDragHandlers`, update `onPointerDown` (lines 125-133) to record the grab origin for range drags. Also relax the handler param types to accept the div (the band is a `<div>`, the handles are `<button>`):

```ts
  const createDragHandlers = (handle: Handle) => ({
    onMouseDown: blockMouse,
    onClick: blockMouse,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressNextClick();
      draggingRef.current = handle;
      liveRef.current = committed;
      if (handle === "range") {
        grabTimeRef.current = valueFromPointer(event.clientX);
        grabSegRef.current = committed;
      }
      setDragLock(true);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (applyHandleFromPointer(handle, event)) {
        paint(liveRef.current);
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (applyHandleFromPointer(handle, event)) {
        finishDrag(handle);
      }
    },
    onLostPointerCapture: () => {
      finishDrag(handle);
    },
    onPointerCancel: () => {
      finishDrag(handle);
    }
  });
```

> If TypeScript complains that `MouseEvent`/`PointerEvent` generic args no longer line up after widening to `HTMLElement`, also widen `blockMouse`'s param to `MouseEvent<HTMLElement>` and `applyHandleFromPointer`'s to `PointerEvent<HTMLElement>`. The runtime behaviour is identical.

- [ ] **Step 6: Attach the handlers to the band**

Update the `rangeRef` `<div>` in the returned JSX (lines 162-166) to spread the drag handlers and mark it draggable:

```tsx
      <div
        ref={rangeRef}
        className="you-loop-loop-range"
        data-testid="loop-range"
        style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        {...createDragHandlers("range")}
      />
```

- [ ] **Step 7: Make the band grabbable in CSS**

In `entrypoints/content/pageUi.styles.ts`, update the `.you-loop-loop-range` rule (lines 61-69) — flip `pointer-events` to `auto`, add a grab cursor and `touch-action: none`:

```css
    /* Teal band over the progress bar marking the loop segment. Draggable to
       slide the whole loop as a fixed-length window. */
    .you-loop-loop-range {
      background: rgba(20, 184, 166, 0.55);
      border-radius: 1px;
      cursor: grab;
      height: 9px;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      transform: translateY(-50%);
    }

    .you-loop-loop-range:active {
      cursor: grabbing;
    }
```

> Tradeoff (intended): with `pointer-events: auto`, clicking the progress bar *inside* the loop band drags the window instead of seeking. Seeking outside the band, and the native scrubber elsewhere, are unaffected (the band only spans the loop region; `blockMouse` already stops the click reaching YouTube).

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test -- TimelineHandles`
Expected: PASS (2 tests).

- [ ] **Step 9: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add features/player-overlay/TimelineHandles.tsx features/player-overlay/TimelineHandles.test.tsx entrypoints/content/pageUi.styles.ts
git commit -m "feat(overlay): drag the loop band to slide the window on the main timeline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LcgTf4djohFcr6ZFX4V5QK"
```

---

### Task 5: Discoverability — help modal rows + domain term

**Files:**
- Modify: `features/player-overlay/HelpModal.tsx` (`SHORTCUTS` array)
- Modify: `features/player-overlay/HelpModal.test.tsx`
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: existing `Shortcut` type (`{ keys: string; hold?: boolean; name: string; desc: string }`) and the `SHORTCUTS`-driven `you-loop-help-row` list.
- Produces: two new help rows. No code exports.

- [ ] **Step 1: Write the failing test**

In `features/player-overlay/HelpModal.test.tsx`, add a test asserting the new rows render. (Match the existing render/query pattern in that file — open the modal, then query text.)

```ts
  it("documents the window step and nudge keys", () => {
    renderOpenHelpModal(); // use whatever the file's existing open helper is
    expect(screen.getByText("Step window")).toBeInTheDocument();
    expect(screen.getByText("Nudge window")).toBeInTheDocument();
  });
```

> If the file has no `renderOpenHelpModal` helper, copy the open-modal setup from the nearest existing test in the same file (it already renders `<HelpModal open ... />` and queries by text).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- HelpModal`
Expected: FAIL — text not found.

- [ ] **Step 3: Add the shortcut rows**

In `features/player-overlay/HelpModal.tsx`, append to the `SHORTCUTS` array (after the `D` entry, line 145):

```ts
  {
    keys: "[ ]",
    name: "Step window",
    desc: "Move the loop forward/back by its own length, keeping the length.",
  },
  {
    keys: "⇧ [ ]",
    name: "Nudge window",
    desc: "Nudge the loop forward/back a little, keeping the length.",
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- HelpModal`
Expected: PASS.

- [ ] **Step 5: Add the domain term to CONTEXT.md**

In `CONTEXT.md`, add a term after **Play Mode** (around line 41 in the term list) — keep the same format as the surrounding glossary:

```markdown
**Window Shift**:
Moving a **Loop Segment** along the timeline without changing its length, by dragging the loop band or stepping/nudging it with the keyboard.
_Avoid_: Pan, scroll, drag-all
```

And add to the **Relationships** list:

```markdown
- A **Window Shift** preserves the length of the active **Loop Segment**.
```

- [ ] **Step 6: Full verification**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add features/player-overlay/HelpModal.tsx features/player-overlay/HelpModal.test.tsx CONTEXT.md
git commit -m "docs(overlay): document window step/nudge keys and add Window Shift term

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LcgTf4djohFcr6ZFX4V5QK"
```

---

### Task 6: Manual smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Build and load the dev extension**

Run: `pnpm dev` (Chrome) — load `.output/chrome-mv3-dev` as an unpacked extension.

- [ ] **Step 2: Main-timeline drag**

On a YouTube video, enable the loop, set a short loop, then drag the teal band: the whole loop slides, length unchanged, and stops flush at each end. Playback keeps looping; if the playhead falls outside, it snaps in on the next wrap.

- [ ] **Step 3: Step / nudge keys**

Press `]` / `[`: the loop hops forward/back by its own length. Hold `]`: it marches. `Shift+]` / `Shift+[`: small nudges. Keys do nothing while typing in the YouTube search box or while the loop is off.

- [ ] **Step 4: Zoom panel**

Open the Zoom Panel. `]` / `[` and Shift variants move the zoom sub-region, clamped inside the main loop. Dragging the zoom track still scrubs the playhead (NOT a window move) — confirm it is unchanged.

- [ ] **Step 5: Help modal**

Open the help modal; confirm the `[ ]` and `⇧ [ ]` rows read correctly.

---

## Self-Review Notes

- **Spec coverage:** `translateSegment` + bounds table (Task 1); `NUDGE_SECONDS` + step=±len/nudge=±NUDGE (Tasks 1–2); `event.code` matching + auto-repeat + gating (Task 2); two-region routing + re-clamp + no-seek (Task 3); main band drag with the existing paint/commit machinery + CSS (Task 4); zoom-panel = keys-only, scrub untouched (Tasks 3–4 + Task 6 Step 4); help modal + CONTEXT term (Task 5). All spec sections map to a task.
- **Type consistency:** `translateSegment(segment, delta, bounds)` and `MoveBounds {min,max}` are used identically in Tasks 1, 3, 4. `moveActiveWindow(delta: number)` matches across `LoopKeyDeps` (Task 2), the pageUi closure and the `createLoopKeyHandlers` call (Task 3). `Handle = "start" | "end" | "range"` is consistent in Task 4.
- **Known intra-plan typecheck gap:** Task 2 leaves `pageUi.tsx` momentarily missing `moveActiveWindow`; Task 3 closes it. Called out in Task 2 Step 6.
- **No placeholders:** every code step shows complete code. The two "match the existing helper" notes (Task 3 percentage strings, Task 5 modal-open helper) are environment/file-specific values the implementer reads off the file they can see, with the invariant stated either way.
