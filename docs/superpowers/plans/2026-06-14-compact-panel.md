# Compact Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an icon-only compact form of the loop panel that activates automatically on narrow players, so every control stays usable without spilling past the player edges.

**Architecture:** Player width is observed with a `ResizeObserver` on the page-ui element and written to `panel.dataset.compact` (mirroring the existing `watchAutohide` helper) — width never enters the React render path. The compact form is pure CSS gated on `.you-loop-page-ui[data-compact="true"]`, except the mode control, which gains a compact icon-button variant in `LoopPanel` markup that CSS swaps in. A hysteresis band (enter <480px, exit ≥500px) prevents oscillation at the boundary.

**Tech Stack:** WXT content script, React (light-DOM mount inside `.ytp-progress-bar`), TypeScript, vitest + jsdom + @testing-library/react.

---

### Task 1: `nextCompactState` pure function + hysteresis test

The width→compact decision, isolated so the hysteresis is unit-testable. Lives in `pageUi.tsx` and is exported.

**Files:**
- Modify: `entrypoints/content/pageUi.tsx`
- Test: `entrypoints/content/pageUi.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `entrypoints/content/pageUi.test.tsx`. Add `nextCompactState` to the existing import from `"./pageUi"` (line 4):

```tsx
describe("nextCompactState", () => {
  it("becomes compact when clearly narrow", () => {
    expect(nextCompactState(479, false)).toBe(true);
  });

  it("stays full at the enter boundary", () => {
    expect(nextCompactState(480, false)).toBe(false);
  });

  it("stays full when clearly wide", () => {
    expect(nextCompactState(900, false)).toBe(false);
  });

  it("holds compact across the dead band", () => {
    expect(nextCompactState(485, true)).toBe(true);
    expect(nextCompactState(499, true)).toBe(true);
  });

  it("exits compact only at or past the exit boundary", () => {
    expect(nextCompactState(500, true)).toBe(false);
    expect(nextCompactState(520, true)).toBe(false);
  });

  it("holds full across the dead band coming from wide", () => {
    expect(nextCompactState(485, false)).toBe(false);
  });
});
```

Update the import line:

```tsx
import { setPageUiVisible, nextCompactState } from "./pageUi";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx -t nextCompactState`
Expected: FAIL — `nextCompactState is not a function` / import has no such export.

- [ ] **Step 3: Write minimal implementation**

Add near the top of `entrypoints/content/pageUi.tsx` (after the imports, before `createPageUiElement`):

```tsx
// Player-width thresholds for the compact panel form, with a dead band so a
// pill sitting right at the edge does not oscillate between forms.
const COMPACT_ENTER_PX = 480;
const COMPACT_EXIT_PX = 500;

// Pure width→compact decision. `prev` is the current compact flag; the band
// between ENTER and EXIT holds whatever state we are already in.
export function nextCompactState(width: number, prev: boolean): boolean {
  if (prev) return width < COMPACT_EXIT_PX; // stay compact until clearly wide
  return width < COMPACT_ENTER_PX; // go compact once clearly narrow
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx -t nextCompactState`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/pageUi.tsx entrypoints/content/pageUi.test.tsx
git commit -m "feat: add nextCompactState width hysteresis for compact panel"
```

---

### Task 2: `watchPlayerWidth` observer wired into the page UI

A `ResizeObserver` that drives `panel.dataset.compact`, mirroring `watchAutohide`. Verified through a behavioral test that mounts the UI and resizes the observed element.

**Files:**
- Modify: `entrypoints/content/pageUi.tsx` (add `watchPlayerWidth`, wire it in `createPageUiElement`)
- Test: `entrypoints/content/pageUi.test.tsx`

- [ ] **Step 1: Write the failing test**

`ResizeObserver` does not exist in jsdom and does not fire on manual size changes. Drive the helper directly with a stub that captures the callback, then invoke it. Append to `pageUi.test.tsx`:

```tsx
describe("watchPlayerWidth", () => {
  afterEach(() => {
    // restore any stub set in a test
    // @ts-expect-error test cleanup
    delete window.__roCallback;
  });

  it("sets data-compact on the panel from the observed width", () => {
    const callbacks: ResizeObserverCallback[] = [];
    const original = window.ResizeObserver;
    class StubRO {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    // @ts-expect-error test stub
    window.ResizeObserver = StubRO;

    const panel = document.createElement("div");
    Object.defineProperty(panel, "clientWidth", {
      configurable: true,
      value: 300
    });

    const stop = watchPlayerWidth(panel);
    // initial sync runs in the helper
    expect(panel.dataset.compact).toBe("true");

    Object.defineProperty(panel, "clientWidth", {
      configurable: true,
      value: 900
    });
    callbacks[0]([], {} as ResizeObserver);
    expect(panel.dataset.compact).toBe("false");

    stop();
    // @ts-expect-error test restore
    window.ResizeObserver = original;
  });
});
```

Update the import:

```tsx
import { setPageUiVisible, nextCompactState, watchPlayerWidth } from "./pageUi";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx -t watchPlayerWidth`
Expected: FAIL — `watchPlayerWidth is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `entrypoints/content/pageUi.tsx`, directly below `watchAutohide` (it follows the same shape — sync now, observe, return a disconnect):

```tsx
// Drive the compact panel form from the player's content width. The page-ui
// element has `inset: 0`, so its width tracks the player. Writes
// `panel.dataset.compact` only when the form flips, so resize bursts don't
// churn the DOM. CSS keys the compact styles off this attribute.
export function watchPlayerWidth(panel: HTMLElement) {
  let compact = false;

  const sync = () => {
    const next = nextCompactState(panel.clientWidth, compact);
    if (next === compact && panel.dataset.compact != null) return;
    compact = next;
    panel.dataset.compact = next ? "true" : "false";
  };

  sync();

  if (typeof ResizeObserver === "undefined") {
    return () => {};
  }

  const observer = new ResizeObserver(sync);
  observer.observe(panel);

  return () => observer.disconnect();
}
```

Wire it into `createPageUiElement`. After the `stopAutohide` line:

```tsx
  const stopAutohide = watchAutohide(video, panel);
  const stopWidth = watchPlayerWidth(panel);
```

Add `stopWidth()` to the `cleanup` callback in the `mountedPageUis.set(...)` block, alongside `stopTimeline()` and `stopAutohide()`:

```tsx
    cleanup: () => {
      stopTimeline();
      stopAutohide();
      stopWidth();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx -t watchPlayerWidth`
Expected: PASS.

- [ ] **Step 5: Run the full pageUi suite (no regressions)**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx`
Expected: PASS (all existing + new tests).

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content/pageUi.tsx entrypoints/content/pageUi.test.tsx
git commit -m "feat: drive panel data-compact from a player-width observer"
```

---

### Task 3: Compact mode-toggle icon button in `LoopPanel`

Add a single icon button that toggles loop/one-shot, shown only in the compact form. The existing `.you-loop-modes` segmented control stays for the full form; CSS (Task 4) shows exactly one.

**Files:**
- Modify: `features/player-overlay/LoopPanel.tsx`
- Test: `entrypoints/content/pageUi.test.tsx`

- [ ] **Step 1: Write the failing test**

The compact button is always in the DOM (CSS hides it in full form), so it is queryable. It shares `onToggleMode` with the segmented control. Append to `pageUi.test.tsx`:

```tsx
describe("compact mode toggle", () => {
  it("renders a mode toggle button reflecting the current mode", () => {
    const mounted = mountYouTubePlayer();
    act(() => {
      setPageUiVisible(mounted.player, true);
    });
    act(() => {
      enableLoop();
    });

    const toggle = screen.getByLabelText(/switch to one-shot/i);
    expect(toggle.dataset.mode).toBe("loop");

    act(() => {
      fireEvent.click(toggle);
    });

    expect(screen.getByLabelText(/switch to loop/i).dataset.mode).toBe(
      "one-shot"
    );
  });
});
```

This reuses `mountYouTubePlayer` and `enableLoop` already defined in the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx -t "compact mode toggle"`
Expected: FAIL — no element labeled "switch to one-shot".

- [ ] **Step 3: Write minimal implementation**

In `features/player-overlay/LoopPanel.tsx`, add the compact button as a sibling of the `.you-loop-modes` group, inside `.you-loop-cluster-inner` (immediately after the closing `</div>` of `.you-loop-modes`, before `<SpeedControl ... />`):

```tsx
            <button
              type="button"
              className="you-loop-mode-compact"
              data-mode={mode}
              data-disabled={!enabled}
              disabled={!enabled}
              aria-label={
                mode === "loop" ? "Switch to one-shot" : "Switch to loop"
              }
              onPointerDown={swallow}
              onMouseDown={swallow}
              onClick={(event) => {
                swallow(event);
                onToggleMode();
              }}
            >
              {mode === "loop" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M5 9a4 4 0 0 1 4-4h7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13 2.5 16.5 5 13 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 15a4 4 0 0 1-4 4H8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M11 21.5 7.5 19 11 16.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M4 12h14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M14 7l5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx -t "compact mode toggle"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/player-overlay/LoopPanel.tsx entrypoints/content/pageUi.test.tsx
git commit -m "feat: add compact mode-toggle icon button to LoopPanel"
```

---

### Task 4: Compact-form CSS

Pure-CSS shrink + swap, gated on `.you-loop-page-ui[data-compact="true"]`, plus the default rule hiding the compact mode button in the full form. No test (visual/style only); verified manually in Task 5.

**Files:**
- Modify: `entrypoints/content/pageUi.styles.ts`

- [ ] **Step 1: Add base + compact rules for the mode button and compact overrides**

Append the following block to the `PAGE_UI_STYLES` template string, just before its closing backtick (the `VIDEO_LIST_STYLES` interpolation, if present at the end, must stay last — insert this above it):

```css
    /* Compact mode toggle: a single icon button replacing the segmented
       Loop/One-shot control on narrow players. Hidden in the full form. */
    .you-loop-mode-compact {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: none;
      flex: none;
      height: 26px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease;
      width: 26px;
    }

    .you-loop-mode-compact svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-mode-compact:not(:disabled):hover {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    .you-loop-mode-compact[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-mode-compact:disabled {
      cursor: default;
    }

    /* ── Compact form ──────────────────────────────────────────────────────
       Active when the player is narrow (data-compact set by
       watchPlayerWidth). Shrinks the round controls, tightens the pill, swaps
       the segmented mode control for the icon button, and drops the wordmark
       so the off-state pill is just power + help. */
    .you-loop-page-ui[data-compact="true"] .you-loop-panel {
      gap: 4px;
      padding: 3px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-power,
    .you-loop-page-ui[data-compact="true"] .you-loop-zoom-toggle,
    .you-loop-page-ui[data-compact="true"] .you-loop-loops-toggle,
    .you-loop-page-ui[data-compact="true"] .you-loop-help-toggle {
      height: 26px;
      width: 26px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-power svg {
      height: 15px;
      width: 15px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-zoom-toggle svg,
    .you-loop-page-ui[data-compact="true"] .you-loop-loops-toggle svg,
    .you-loop-page-ui[data-compact="true"] .you-loop-help-toggle svg {
      height: 14px;
      width: 14px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-modes {
      display: none;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-mode-compact {
      display: inline-flex;
    }

    /* No wordmark in compact: collapse its reserved slot and hide the text, so
       the off-state pill stays tiny. */
    .you-loop-page-ui[data-compact="true"] .you-loop-wordmark {
      display: none;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-wordmark-slot {
      width: 0;
    }
```

Note: `data-compact` lives on the `.you-loop-page-ui` root while `data-on` lives on the inner `.you-loop-panel`, so this slot-collapse rule keys off the root only. It overrides the default `.you-loop-panel[data-on="false"] .you-loop-wordmark-slot { width: 92px }`: both selectors have equal specificity (0,3,0), so the cascade falls to source order — this block is appended after, so it wins. In compact the slot is always 0 and the wordmark is never shown.

- [ ] **Step 2: Verify the stylesheet still builds (typecheck the module)**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx`
Expected: PASS — the suite imports `PAGE_UI_STYLES` transitively via `setPageUiVisible`; a broken template literal would fail to import.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/pageUi.styles.ts
git commit -m "feat: compact-form styles for the loop panel"
```

---

### Task 5: Manual verification + typecheck/lint

End-to-end check in a real browser plus repo gates.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck and run the full test suite**

Run: `pnpm vitest run`
Expected: PASS, no failures.

- [ ] **Step 2: Build the extension**

Run: `pnpm build` (or the repo's dev command — check `package.json` scripts)
Expected: builds without TypeScript or bundler errors.

- [ ] **Step 3: Load in browser and exercise the threshold**

See `memory/you-loop-dev-reload-gotchas.md` for which reload to use after a build. On a YouTube watch page:
- Narrow the window until the player content width drops below ~480px → panel switches to the compact icon-only form; no controls spill past the player.
- Widen back past ~500px → full form returns; no flicker while dragging the window edge slowly across the band.
- In compact form: power, mode icon, speed chip, zoom, loops, help are all present and clickable; the mode icon reflects loop vs one-shot and toggles on click.
- Toggle the loop off in compact form → pill collapses to power + help only, no wordmark.
- Open the miniplayer → compact form. Enter theater/fullscreen → full form.

- [ ] **Step 4: Commit any fixes**

If Step 3 surfaces issues, fix them following TDD where a test is possible, then:

```bash
git add -A
git commit -m "fix: <describe the compact-form fix>"
```
