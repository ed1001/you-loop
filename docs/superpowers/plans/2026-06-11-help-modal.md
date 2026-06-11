# Help Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a sleek docs modal — triggered by an info icon at the far-right of the loop panel — that explains the panel controls and keyboard shortcuts, styled to match the panel (translucent dark card, teal text, dark border), centered over the player.

**Architecture:** New `features/player-overlay/HelpModal.tsx` renders a backdrop+card via `createPortal` into the `.html5-video-player` root (so it centers over the whole player in default/theater/fullscreen). `LoopPanel.tsx` gains an always-enabled info button (`onShowHelp`). `pageUi.tsx` holds `helpOpen` state, renders `<HelpModal>`, and adds the modal CSS to its inline stylesheet. Closeable via backdrop click, ✕ button, or `Escape`.

**Tech Stack:** React 19 (`react-dom/client` + `createPortal`), WXT content script, inline CSS string, Vitest + jsdom + @testing-library/react.

---

## File Structure

- Create: `features/player-overlay/HelpModal.tsx` — the modal component (portal, content, close interactions).
- Create: `features/player-overlay/HelpModal.test.tsx` — component tests.
- Modify: `features/player-overlay/LoopPanel.tsx` — add `onShowHelp` prop + info button after the zoom toggle.
- Modify: `entrypoints/content/pageUi.tsx` — `helpOpen` state, render `<HelpModal>`, wire `onShowHelp`, append modal CSS.

---

## Task 1: HelpModal component

**Files:**
- Create: `features/player-overlay/HelpModal.tsx`
- Test: `features/player-overlay/HelpModal.test.tsx`

- [ ] **Step 1: Write the component**

Create `features/player-overlay/HelpModal.tsx`:

```tsx
import { useEffect } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  // The `.html5-video-player` root to portal into. null while not resolved.
  container: HTMLElement | null;
  onClose: () => void;
};

// Our overlay lives inside YouTube's progress bar, which binds its own pointer
// handlers; swallow events so interacting with the modal never scrubs the video.
const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

type Shortcut = { keys: string; hold?: boolean; name: string; desc: string };
type Control = { term: string; desc: string };

const CONTROLS: Control[] = [
  { term: "Power", desc: "Turn the loop range on or off." },
  {
    term: "Loop / One-shot",
    desc: "Loop repeats the range; one-shot plays it through once and stops."
  },
  {
    term: "Speed − ＋",
    desc: "Step playback speed up or down. Resets to 1× when the loop turns off."
  },
  {
    term: "Zoom",
    desc: "Magnify the looped region for finer, more precise sub-loops."
  }
];

const SHORTCUTS: Shortcut[] = [
  { keys: "A", name: "Restart", desc: "Jump to the loop start and play." },
  {
    keys: "S",
    hold: true,
    name: "Punch-in",
    desc: "Play from the loop start; release snaps back to it."
  },
  {
    keys: "D",
    hold: true,
    name: "Push-to-hear",
    desc: "Play from the playhead; release pauses in place."
  }
];

export function HelpModal({ open, container, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || container == null) return null;

  return createPortal(
    <div
      className="you-loop-help-backdrop"
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={(event) => {
        swallow(event);
        onClose();
      }}
    >
      <div
        className="you-loop-help-card"
        role="dialog"
        aria-modal="true"
        aria-label="you-loop help"
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <button
          type="button"
          className="you-loop-help-close"
          aria-label="Close help"
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(event) => {
            swallow(event);
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="you-loop-help-head">
          <span className="you-loop-help-eyebrow">you-loop</span>
          <h2 className="you-loop-help-title">
            Loop, zoom &amp; rehearse any section of a video
          </h2>
          <p className="you-loop-help-intro">
            Set a range on the timeline, then refine it, repeat it, slow it
            down, and drive playback straight from the keyboard.
          </p>
        </div>

        <section className="you-loop-help-section">
          <h3 className="you-loop-help-label">Panel</h3>
          <ul className="you-loop-help-list">
            {CONTROLS.map((control) => (
              <li key={control.term} className="you-loop-help-row">
                <span className="you-loop-help-term">{control.term}</span>
                <span className="you-loop-help-desc">{control.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="you-loop-help-section">
          <h3 className="you-loop-help-label">
            Keyboard
            <span className="you-loop-help-note"> — while the loop is on</span>
          </h3>
          <ul className="you-loop-help-list">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys} className="you-loop-help-row">
                <span className="you-loop-help-keys">
                  <kbd className="you-loop-kbd">{shortcut.keys}</kbd>
                  {shortcut.hold && (
                    <span className="you-loop-help-hold">hold</span>
                  )}
                </span>
                <span className="you-loop-help-body">
                  <span className="you-loop-help-term">{shortcut.name}</span>
                  <span className="you-loop-help-desc">{shortcut.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="you-loop-help-foot">
          Shortcuts work while the loop is on, and are ignored while you type.
        </p>
      </div>
    </div>,
    container
  );
}
```

- [ ] **Step 2: Write the tests**

Create `features/player-overlay/HelpModal.test.tsx`:

```tsx
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpModal } from "./HelpModal";

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
});

describe("HelpModal", () => {
  it("renders nothing when closed", () => {
    const container = document.createElement("div");
    render(<HelpModal open={false} container={container} onClose={() => {}} />);
    expect(container.querySelector(".you-loop-help-card")).toBeNull();
  });

  it("renders nothing when there is no container", () => {
    render(<HelpModal open container={null} onClose={() => {}} />);
    expect(document.querySelector(".you-loop-help-card")).toBeNull();
  });

  it("portals the card into the given container with panel + keyboard docs", () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(<HelpModal open container={container} onClose={() => {}} />);

    const card = container.querySelector(".you-loop-help-card");
    expect(card).not.toBeNull();
    // Panel section documents the Zoom control with the polished copy.
    expect(card!.textContent).toContain("Zoom");
    expect(card!.textContent).toContain("Magnify the looped region");
    // Keyboard section lists the three shortcut keys.
    const keys = Array.from(container.querySelectorAll(".you-loop-kbd")).map(
      (el) => el.textContent
    );
    expect(keys).toEqual(["A", "S", "D"]);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);

    fireEvent.click(container.querySelector(".you-loop-help-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the card itself is clicked", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);

    fireEvent.click(container.querySelector(".you-loop-help-card")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);

    fireEvent.click(container.querySelector(".you-loop-help-close")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run features/player-overlay/HelpModal.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add features/player-overlay/HelpModal.tsx features/player-overlay/HelpModal.test.tsx
git commit -m "feat: HelpModal component for loop docs"
```

---

## Task 2: Info button in the panel

**Files:**
- Modify: `features/player-overlay/LoopPanel.tsx`

- [ ] **Step 1: Add the prop**

In `features/player-overlay/LoopPanel.tsx`, add `onShowHelp: () => void;` to the `Props` type (after `onResetSpeed`), and add `onShowHelp` to the destructured parameters in the `LoopPanel` function signature (after `onResetSpeed`).

- [ ] **Step 2: Add the info button**

Immediately AFTER the closing `</button>` of the zoom toggle (the `.you-loop-zoom-toggle` button, which is the last element before the panel's closing `</div>`), and BEFORE that closing `</div>`, insert:

```tsx
      <button
        type="button"
        className="you-loop-help-toggle"
        aria-haspopup="dialog"
        aria-label="Show help"
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={(event) => {
          swallow(event);
          onShowHelp();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 11v5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="7.6" r="1.05" fill="currentColor" />
        </svg>
      </button>
```

Note: this button is intentionally NOT gated on `enabled` — help is always reachable.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: it will FAIL in `pageUi.tsx` because `onShowHelp` is now required but not yet passed — this is expected and resolved by Task 3. The `LoopPanel.tsx` file itself must have no errors.

- [ ] **Step 4: Commit**

```bash
git add features/player-overlay/LoopPanel.tsx
git commit -m "feat: add info button to loop panel"
```

---

## Task 3: Wire the modal into the overlay + styles

**Files:**
- Modify: `entrypoints/content/pageUi.tsx`

- [ ] **Step 1: Import HelpModal**

After the existing `import { createLoopKeyHandlers } from "../../features/playback/shortcuts";` line, add:

```tsx
import { HelpModal } from "../../features/player-overlay/HelpModal";
```

- [ ] **Step 2: Add help state**

In `renderTimelineCursors`, alongside the other mutable view flags (e.g. near `let zoomed = false;`), add:

```tsx
  let helpOpen = false;
```

- [ ] **Step 3: Render HelpModal and wire the panel**

In the `render` function's `root.render(<> ... </>)` JSX, the `<LoopPanel ... />` element currently ends with `onResetSpeed={resetSpeed}`. Add this prop to it:

```tsx
          onShowHelp={() => {
            helpOpen = true;
            render();
          }}
```

Then, immediately AFTER the `<LoopPanel ... />` element (still inside the fragment), add:

```tsx
        <HelpModal
          open={helpOpen}
          container={video.closest(".html5-video-player")}
          onClose={() => {
            helpOpen = false;
            render();
          }}
        />
```

- [ ] **Step 4: Add the modal styles**

In `ensureDocumentStyles`, the inline stylesheet is a template string assigned to `style.textContent`. Find the LAST CSS rule in that template (the `.html5-video-player:has(.you-loop-zoom-track:hover) .ytp-heat-map-edu { ... }` block) and append the following CSS immediately after it, still inside the template literal (before the closing `` ` `` and `;`):

```css
    /* ---- Help: info toggle + docs modal ---- */
    .you-loop-help-toggle {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease;
      width: 30px;
    }

    .you-loop-help-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-help-toggle:hover {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    .you-loop-help-backdrop {
      align-items: center;
      animation: you-loop-help-fade 0.18s ease both;
      background: rgba(0, 0, 0, 0.5);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 24px;
      pointer-events: auto;
      position: absolute;
      z-index: 2147483647;
    }

    @keyframes you-loop-help-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .you-loop-help-card {
      animation: you-loop-help-rise 0.24s cubic-bezier(0.16, 1, 0.3, 1) both;
      background: rgba(28, 28, 32, 0.82);
      -webkit-backdrop-filter: blur(18px) saturate(1.2);
      backdrop-filter: blur(18px) saturate(1.2);
      border: 1px solid rgba(0, 0, 0, 0.6);
      border-radius: 16px;
      box-shadow:
        0 0 0 1px rgba(20, 184, 166, 0.16),
        0 24px 70px rgba(0, 0, 0, 0.6),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      box-sizing: border-box;
      color: rgba(255, 255, 255, 0.78);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      max-height: calc(100% - 48px);
      max-width: 440px;
      overflow-y: auto;
      padding: 26px 28px 22px;
      position: relative;
      width: 100%;
    }

    @keyframes you-loop-help-rise {
      from { opacity: 0; transform: translateY(10px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .you-loop-help-close {
      align-items: center;
      background: rgba(255, 255, 255, 0.06);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      padding: 0;
      position: absolute;
      right: 16px;
      top: 16px;
      transition: color 0.18s ease, background 0.18s ease;
      width: 28px;
    }

    .you-loop-help-close svg {
      height: 15px;
      width: 15px;
    }

    .you-loop-help-close:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    .you-loop-help-eyebrow {
      color: #14b8a6;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .you-loop-help-title {
      color: #5eead4;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.25;
      margin: 8px 36px 0 0;
    }

    .you-loop-help-intro {
      color: rgba(255, 255, 255, 0.62);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 8px 0 0;
    }

    .you-loop-help-section {
      margin-top: 20px;
    }

    .you-loop-help-label {
      color: #14b8a6;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.16em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }

    .you-loop-help-note {
      color: rgba(255, 255, 255, 0.4);
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: none;
    }

    .you-loop-help-list {
      display: flex;
      flex-direction: column;
      gap: 11px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .you-loop-help-row {
      align-items: baseline;
      display: grid;
      gap: 6px 14px;
      grid-template-columns: 96px 1fr;
    }

    .you-loop-help-term {
      color: rgba(255, 255, 255, 0.92);
      font-size: 12.5px;
      font-weight: 600;
    }

    .you-loop-help-desc {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12.5px;
      line-height: 1.45;
    }

    .you-loop-help-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .you-loop-help-keys {
      align-items: center;
      display: flex;
      gap: 7px;
    }

    .you-loop-kbd {
      background: rgba(0, 0, 0, 0.34);
      border-radius: 6px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      color: #5eead4;
      display: inline-flex;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      justify-content: center;
      min-width: 24px;
      padding: 4px 7px;
    }

    .you-loop-help-hold {
      color: rgba(255, 255, 255, 0.4);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .you-loop-help-foot {
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.38);
      font-size: 11px;
      margin: 20px 0 0;
      padding-top: 12px;
    }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (resolves the `onShowHelp` requirement from Task 2).

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all suites including HelpModal and the existing pageUi tests.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/content/pageUi.tsx
git commit -m "feat: wire help modal + info button into overlay"
```

---

## Manual Verification

Build, load the extension, open a YouTube video:

1. Info icon (ⓘ) shows at the far right of the panel and is clickable even when the loop is OFF.
2. Clicking it opens a centered, translucent dark card with a teal title, blurred backdrop dimming the player.
3. Card lists the intro, then the Panel controls (Power, Loop/One-shot, Speed, Zoom), then the Keyboard shortcuts (A, hold S, hold D).
4. Closes via the ✕ button, clicking the backdrop, or pressing `Escape`. Clicking inside the card does not close it.
5. Works in default, theater, and fullscreen (modal centers over the player).
