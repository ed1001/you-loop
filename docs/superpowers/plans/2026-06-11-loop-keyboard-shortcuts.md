# Loop Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `a` (restart), hold-`s` (punch-in snap-back), and hold-`d` (punch-in push-to-hear) keyboard shortcuts, active only while the loop is on.

**Architecture:** A pure, DOM-agnostic module `features/playback/shortcuts.ts` exposes `createLoopKeyHandlers(deps)` returning `{ onKeyDown, onKeyUp }`. The handlers read/write the injected `video` and call injected getters for the active segment, loop-active flag, and a one-shot reset. `entrypoints/content/pageUi.tsx` owns the lifecycle: it attaches the handlers to `document` in the capture phase on mount and removes them in `stop()`. End-of-loop wrapping/stopping is already handled by the existing `enforceSegmentEnd` on `timeupdate`, so it is reused unchanged.

**Tech Stack:** TypeScript, WXT content script, React (for the overlay render), Vitest + jsdom for tests.

---

## File Structure

- Create: `features/playback/shortcuts.ts` — key→action mapping, gating, held-state tracking. One responsibility: translate keyboard events into video actions.
- Create: `features/playback/shortcuts.test.ts` — unit tests against a fake video and synthetic events.
- Modify: `entrypoints/content/pageUi.tsx` — wire the handlers onto `document` and tear them down in `stop()`.

The reducer, types, and `enforceSegmentEnd` controller are reused with **no changes**.

---

## Task 1: Shortcut handler module

**Files:**
- Create: `features/playback/shortcuts.ts`
- Test: `features/playback/shortcuts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `features/playback/shortcuts.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createLoopKeyHandlers, type LoopKeyDeps } from "./shortcuts";
import type { LoopSegment } from "./types";

function video(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    currentTime: 6,
    paused: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides
  } as unknown as HTMLVideoElement;
}

function setup(depsOverrides: Partial<LoopKeyDeps> = {}) {
  const vid = video();
  const resetOneShot = vi.fn();
  const segment: LoopSegment = { start: 5, end: 8 };
  const deps: LoopKeyDeps = {
    video: vid,
    getSegment: () => segment,
    isActive: () => true,
    resetOneShot,
    ...depsOverrides
  };
  return { vid, resetOneShot, handlers: createLoopKeyHandlers(deps) };
}

function keyEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key,
    repeat: false,
    target: document.body,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides
  } as unknown as KeyboardEvent;
}

describe("loop key handlers", () => {
  it("restart (a) seeks to start, plays, and resets one-shot", () => {
    const { vid, resetOneShot, handlers } = setup();
    handlers.onKeyDown(keyEvent("a"));
    expect(resetOneShot).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(5);
    expect(vid.play).toHaveBeenCalledTimes(1);
  });

  it("snap-back (s) plays from start on press, pauses+rewinds on release", () => {
    const { vid, resetOneShot, handlers } = setup();
    handlers.onKeyDown(keyEvent("s"));
    expect(resetOneShot).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(5);
    expect(vid.play).toHaveBeenCalledTimes(1);

    vid.currentTime = 7; // playback advanced
    handlers.onKeyUp(keyEvent("s"));
    expect(vid.pause).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(5);
  });

  it("push-to-hear (d) plays from current position, pauses in place on release", () => {
    const { vid, handlers } = setup();
    handlers.onKeyDown(keyEvent("d"));
    expect(vid.play).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(6); // unchanged

    vid.currentTime = 7;
    handlers.onKeyUp(keyEvent("d"));
    expect(vid.pause).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(7); // stays put
  });

  it("ignores auto-repeat keydown while held", () => {
    const { vid, handlers } = setup();
    handlers.onKeyDown(keyEvent("d"));
    handlers.onKeyDown(keyEvent("d", { repeat: true }));
    expect(vid.play).toHaveBeenCalledTimes(1);
  });

  it("no-ops when the loop is not active", () => {
    const { vid, handlers } = setup({ isActive: () => false });
    const event = keyEvent("a");
    handlers.onKeyDown(event);
    expect(vid.play).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("no-ops when there is no segment", () => {
    const { vid, handlers } = setup({ getSegment: () => null });
    handlers.onKeyDown(keyEvent("a"));
    expect(vid.play).not.toHaveBeenCalled();
  });

  it("no-ops when typing in an input", () => {
    const { vid, handlers } = setup();
    const input = document.createElement("input");
    const event = keyEvent("a", { target: input });
    handlers.onKeyDown(event);
    expect(vid.play).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("passes unbound keys through without intercepting", () => {
    const { vid, handlers } = setup();
    const event = keyEvent("z");
    handlers.onKeyDown(event);
    expect(vid.play).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run features/playback/shortcuts.test.ts`
Expected: FAIL — `createLoopKeyHandlers` not exported / module not found.

- [ ] **Step 3: Write the implementation**

Create `features/playback/shortcuts.ts`:

```typescript
import type { LoopSegment } from "./types";

export type LoopKeyDeps = {
  video: HTMLVideoElement;
  // Region the keys act on: the zoom sub-region when zoomed, else the main
  // loop. null means there is nothing to act on.
  getSegment: () => LoopSegment | null;
  // Whether the loop is currently on. Keys are inert when false.
  isActive: () => boolean;
  // Clears a prior one-shot completion so the segment replays from the top.
  resetOneShot: () => void;
};

export type LoopKeyHandlers = {
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
};

const RESTART_KEY = "a";
const SNAP_BACK_KEY = "s";
const PUSH_TO_HEAR_KEY = "d";
const HANDLED_KEYS = new Set([RESTART_KEY, SNAP_BACK_KEY, PUSH_TO_HEAR_KEY]);

// Don't steal keys while the user is typing (e.g. the YouTube search box).
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function createLoopKeyHandlers(deps: LoopKeyDeps): LoopKeyHandlers {
  // Tracks which of our keys are physically down, so OS auto-repeat keydowns
  // and duplicate keyups are ignored.
  const held = new Set<string>();

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!HANDLED_KEYS.has(key)) return;
    if (isTypingTarget(event.target)) return;
    if (!deps.isActive()) return;
    const segment = deps.getSegment();
    if (segment == null) return;

    // We own these keys now: stop YouTube and the browser from also acting.
    event.preventDefault();
    event.stopPropagation();

    if (event.repeat || held.has(key)) return;
    held.add(key);

    switch (key) {
      case RESTART_KEY:
      case SNAP_BACK_KEY:
        deps.resetOneShot();
        deps.video.currentTime = segment.start;
        void deps.video.play();
        break;
      case PUSH_TO_HEAR_KEY:
        void deps.video.play();
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!HANDLED_KEYS.has(key)) return;
    // Always clear held-state, even if gating now blocks the action, so a key
    // can't get stuck "held" across a loop toggle.
    const wasHeld = held.delete(key);

    if (isTypingTarget(event.target)) return;
    if (!deps.isActive()) return;
    const segment = deps.getSegment();
    if (segment == null) return;

    event.preventDefault();
    event.stopPropagation();

    if (!wasHeld) return;

    switch (key) {
      case SNAP_BACK_KEY:
        deps.video.pause();
        deps.video.currentTime = segment.start;
        break;
      case PUSH_TO_HEAR_KEY:
        deps.video.pause();
        break;
      // RESTART_KEY is a tap — no release behaviour.
    }
  };

  return { onKeyDown, onKeyUp };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run features/playback/shortcuts.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add features/playback/shortcuts.ts features/playback/shortcuts.test.ts
git commit -m "feat: loop key handler module (restart, punch-in snap-back/push-to-hear)"
```

---

## Task 2: Wire shortcuts into the content overlay

**Files:**
- Modify: `entrypoints/content/pageUi.tsx` (import near top ~line 16; create handlers + attach near the existing `addEventListener` block ~line 241; detach in `stop()` ~line 247)

- [ ] **Step 1: Add the import**

In `entrypoints/content/pageUi.tsx`, after the existing `LoopPanel` import (line 16), add:

```typescript
import { createLoopKeyHandlers } from "../../features/playback/shortcuts";
```

- [ ] **Step 2: Create the handlers and attach them**

In `renderTimelineCursors`, replace this existing block:

```typescript
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("ratechange", onRateChange);
  render();
```

with:

```typescript
  // Keyboard shortcuts act on the active region (zoom sub-loop when zoomed,
  // else the main loop) and only while the loop is on. Capture phase so we beat
  // YouTube's own handlers; gating inside the module decides what to intercept.
  const keyHandlers = createLoopKeyHandlers({
    video,
    getSegment: effectiveSegment,
    isActive: () => state.loopEnabled,
    resetOneShot: () => {
      state = playbackReducer(state, {
        type: "markOneShotCompleted",
        completed: false
      });
      render();
    }
  });

  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("ratechange", onRateChange);
  document.addEventListener("keydown", keyHandlers.onKeyDown, true);
  document.addEventListener("keyup", keyHandlers.onKeyUp, true);
  render();
```

- [ ] **Step 3: Detach in stop()**

In the returned object's `stop()`, replace:

```typescript
    stop: () => {
      clearZoomCloseTimer();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ratechange", onRateChange);
    }
```

with:

```typescript
    stop: () => {
      clearZoomCloseTimer();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ratechange", onRateChange);
      document.removeEventListener("keydown", keyHandlers.onKeyDown, true);
      document.removeEventListener("keyup", keyHandlers.onKeyUp, true);
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all suites, including the new `shortcuts.test.ts` and existing `pageUi.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content/pageUi.tsx
git commit -m "feat: wire loop keyboard shortcuts into content overlay"
```

---

## Manual Verification (after both tasks)

Build and load the extension, open a YouTube video:

1. Loop OFF → `a`/`s`/`d` do nothing; native YouTube keys still work.
2. Loop ON → `a` jumps to loop start and plays.
3. Hold `s` → plays from loop start; in loop mode it wraps at the end, in one-shot mode it stops at the end; release pauses and snaps back to start.
4. Hold `d` → plays from current playhead; release pauses in place; press again resumes from there.
5. Zoom on → keys act on the zoom sub-region, not the full loop.
6. Focus the YouTube search box and type `asd` → letters type normally, no loop actions fire.
