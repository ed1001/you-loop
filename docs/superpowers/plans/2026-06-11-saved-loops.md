# Saved Loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save multiple named loops per YouTube video, pick them from a popover list, and auto-restore the last-used loop on revisit; change the default loop range to `[20%, 80%]`.

**Architecture:** A new `loopStore` module persists per-video loop lists to `browser.storage.local` (injectable storage area for tests). `renderTimelineCursors` in `pageUi.tsx` seeds/restores positions per video and owns the save actions; `LoopPanel` gains a saved-loops button + popover. Pure logic (store, default range) is TDD'd; UI is wired on top.

**Tech Stack:** TypeScript, React 19, WXT (`browser.storage.local`), Vitest + jsdom + Testing Library.

---

## File Structure

- `features/persistence/loopStore.ts` (new) — storage layer: read/write per-video loop lists, LRU eviction, touch-on-access. One responsibility: persistence.
- `features/persistence/loopStore.test.ts` (new) — unit tests with a stub storage area.
- `features/playback/reducer.ts` (modify) — add `defaultLoopSegment` + `DEFAULT_LOOP_FRACTION`.
- `features/playback/reducer.test.ts` (modify) — cover `defaultLoopSegment`.
- `features/player-overlay/SavedLoopsPopover.tsx` (new) — the popover UI (list + save-as-new + update). Keeps `LoopPanel` focused.
- `features/player-overlay/LoopPanel.tsx` (modify) — saved-loops button + popover mount + props.
- `entrypoints/content/pageUi.tsx` (modify) — videoId detection, `loadForVideo`, save actions, default seeding, styles.
- `features/player-overlay/HelpModal.tsx` (modify) — Saved-loops control entry + Memory note.

---

## Task 1: loopStore — types + read/write round-trip

**Files:**
- Create: `features/persistence/loopStore.ts`
- Test: `features/persistence/loopStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// features/persistence/loopStore.test.ts
import { describe, expect, it } from "vitest";
import type { StorageArea, SavedStore } from "./loopStore";
import {
  SAVED_STORE_KEY,
  addLoop,
  loadEntry,
  updateLoop,
  renameLoop,
  removeLoop,
  setLastUsed,
  MAX_SAVED_VIDEOS
} from "./loopStore";

// In-memory stub of the browser.storage.local area.
function makeArea(initial: SavedStore = {}): StorageArea & { dump: () => SavedStore } {
  let data: Record<string, unknown> = { [SAVED_STORE_KEY]: structuredClone(initial) };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      data = { ...data, ...items };
    },
    dump: () => (data[SAVED_STORE_KEY] as SavedStore) ?? {}
  };
}

const seg = (start: number, end: number) => ({ start, end });

describe("loopStore", () => {
  it("adds a loop and reads it back", async () => {
    const area = makeArea();
    const loop = await addLoop("vid1", "Verse", seg(1, 2), null, area, 1000);

    expect(loop.id).toBeTruthy();
    const entry = await loadEntry("vid1", area, 1000);
    expect(entry?.loops).toHaveLength(1);
    expect(entry?.loops[0].name).toBe("Verse");
    expect(entry?.loops[0].main).toEqual(seg(1, 2));
    expect(entry?.lastUsedId).toBe(loop.id);
  });

  it("returns null for an unknown video", async () => {
    const area = makeArea();
    expect(await loadEntry("nope", area, 1000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/persistence/loopStore.test.ts`
Expected: FAIL — cannot find module `./loopStore`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/persistence/loopStore.ts
import type { LoopSegment } from "../playback/types";

export const SAVED_STORE_KEY = "you-loop:saved";
export const MAX_SAVED_VIDEOS = 200;

export type SavedLoop = {
  id: string;
  name: string;
  main: LoopSegment;
  zoom: LoopSegment | null;
};

export type VideoEntry = {
  loops: SavedLoop[];
  lastUsedId: string | null;
  lastSeen: number;
};

export type SavedStore = Record<string, VideoEntry>;

export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

function resolveArea(area?: StorageArea): StorageArea {
  if (area) return area;
  return browser.storage.local as unknown as StorageArea;
}

async function readStore(area: StorageArea): Promise<SavedStore> {
  try {
    const result = await area.get(SAVED_STORE_KEY);
    return (result[SAVED_STORE_KEY] as SavedStore) ?? {};
  } catch {
    return {};
  }
}

async function writeStore(area: StorageArea, store: SavedStore): Promise<void> {
  try {
    await area.set({ [SAVED_STORE_KEY]: store });
  } catch {
    // Best-effort: a failed write leaves the prior store intact.
  }
}

// Drop the least-recently-seen videos once the cap is exceeded.
function evict(store: SavedStore): void {
  const ids = Object.keys(store);
  if (ids.length <= MAX_SAVED_VIDEOS) return;
  const byOldest = ids.sort((a, b) => store[a].lastSeen - store[b].lastSeen);
  for (const id of byOldest.slice(0, ids.length - MAX_SAVED_VIDEOS)) {
    delete store[id];
  }
}

export async function loadEntry(
  videoId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<VideoEntry | null> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return null;
  entry.lastSeen = now; // touch-on-access: revisiting refreshes LRU place
  store[videoId] = entry;
  await writeStore(a, store);
  return entry;
}

export async function addLoop(
  videoId: string,
  name: string,
  main: LoopSegment,
  zoom: LoopSegment | null,
  area?: StorageArea,
  now: number = Date.now()
): Promise<SavedLoop> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const loop: SavedLoop = { id: crypto.randomUUID(), name, main, zoom };
  const entry = store[videoId] ?? { loops: [], lastUsedId: null, lastSeen: now };
  entry.loops = [...entry.loops, loop];
  entry.lastUsedId = loop.id;
  entry.lastSeen = now;
  store[videoId] = entry;
  evict(store);
  await writeStore(a, store);
  return loop;
}

export async function updateLoop(
  videoId: string,
  loopId: string,
  main: LoopSegment,
  zoom: LoopSegment | null,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return;
  entry.loops = entry.loops.map((l) =>
    l.id === loopId ? { ...l, main, zoom } : l
  );
  entry.lastUsedId = loopId;
  entry.lastSeen = now;
  await writeStore(a, store);
}

export async function renameLoop(
  videoId: string,
  loopId: string,
  name: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return;
  entry.loops = entry.loops.map((l) => (l.id === loopId ? { ...l, name } : l));
  entry.lastSeen = now;
  await writeStore(a, store);
}

export async function removeLoop(
  videoId: string,
  loopId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return;
  entry.loops = entry.loops.filter((l) => l.id !== loopId);
  if (entry.lastUsedId === loopId) entry.lastUsedId = null;
  if (entry.loops.length === 0) {
    delete store[videoId];
  } else {
    entry.lastSeen = now;
    store[videoId] = entry;
  }
  await writeStore(a, store);
}

export async function setLastUsed(
  videoId: string,
  loopId: string,
  area?: StorageArea,
  now: number = Date.now()
): Promise<void> {
  const a = resolveArea(area);
  const store = await readStore(a);
  const entry = store[videoId];
  if (!entry) return;
  entry.lastUsedId = loopId;
  entry.lastSeen = now;
  await writeStore(a, store);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run features/persistence/loopStore.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add features/persistence/loopStore.ts features/persistence/loopStore.test.ts
git commit -m "feat: loopStore persistence layer with round-trip tests"
```

---

## Task 2: loopStore — update / rename / remove / lastUsed / LRU

**Files:**
- Test: `features/persistence/loopStore.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

```ts
  it("overwrites a loop in place and sets it as last used", async () => {
    const area = makeArea();
    const a = await addLoop("v", "A", seg(1, 2), null, area, 10);
    const b = await addLoop("v", "B", seg(3, 4), null, area, 20);
    await updateLoop("v", a.id, seg(5, 6), seg(5.2, 5.8), area, 30);

    const entry = await loadEntry("v", area, 40);
    expect(entry?.loops).toHaveLength(2);
    const updated = entry?.loops.find((l) => l.id === a.id);
    expect(updated?.main).toEqual(seg(5, 6));
    expect(updated?.zoom).toEqual(seg(5.2, 5.8));
    expect(entry?.lastUsedId).toBe(a.id);
    expect(b.id).toBeTruthy();
  });

  it("renames a loop", async () => {
    const area = makeArea();
    const loop = await addLoop("v", "Old", seg(1, 2), null, area, 10);
    await renameLoop("v", loop.id, "New", area, 20);
    const entry = await loadEntry("v", area, 30);
    expect(entry?.loops[0].name).toBe("New");
  });

  it("removes a loop, deleting the entry when the last one goes", async () => {
    const area = makeArea();
    const a = await addLoop("v", "A", seg(1, 2), null, area, 10);
    const b = await addLoop("v", "B", seg(3, 4), null, area, 20);
    await removeLoop("v", a.id, area, 30);
    let entry = await loadEntry("v", area, 40);
    expect(entry?.loops.map((l) => l.id)).toEqual([b.id]);

    await removeLoop("v", b.id, area, 50);
    expect(await loadEntry("v", area, 60)).toBeNull();
  });

  it("clears lastUsedId when the last-used loop is removed", async () => {
    const area = makeArea();
    const a = await addLoop("v", "A", seg(1, 2), null, area, 10);
    await addLoop("v", "B", seg(3, 4), null, area, 20);
    await setLastUsed("v", a.id, area, 25);
    await removeLoop("v", a.id, area, 30);
    const entry = await loadEntry("v", area, 40);
    expect(entry?.lastUsedId).toBeNull();
  });

  it("evicts the least-recently-seen video beyond the cap", async () => {
    const area = makeArea();
    // Fill exactly to the cap, each with an increasing lastSeen.
    for (let i = 0; i < MAX_SAVED_VIDEOS; i++) {
      await addLoop(`v${i}`, "L", seg(1, 2), null, area, i + 1);
    }
    // Touch v0 so it is no longer the oldest.
    await loadEntry("v0", area, 10_000);
    // One more distinct video overflows the cap.
    await addLoop("vNew", "L", seg(1, 2), null, area, 10_001);

    const store = area.dump();
    expect(Object.keys(store)).toHaveLength(MAX_SAVED_VIDEOS);
    expect(store["v0"]).toBeDefined(); // spared by the touch
    expect(store["v1"]).toBeUndefined(); // now the oldest, evicted
    expect(store["vNew"]).toBeDefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run features/persistence/loopStore.test.ts`
Expected: PASS already if Task 1 implemented all functions — these exercise existing code. If any FAIL, fix `loopStore.ts` to match.

- [ ] **Step 3: (only if a test failed) fix implementation**

No new code expected; Task 1 implemented every function. If the eviction test fails, confirm `evict` sorts ascending by `lastSeen` and runs inside `addLoop` after the touch.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run features/persistence/loopStore.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add features/persistence/loopStore.test.ts
git commit -m "test: cover loopStore update/rename/remove/LRU"
```

---

## Task 3: defaultLoopSegment in the reducer

**Files:**
- Modify: `features/playback/reducer.ts`
- Test: `features/playback/reducer.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
// add to features/playback/reducer.test.ts imports:
//   import { defaultLoopSegment, DEFAULT_LOOP_FRACTION } from "./reducer";

describe("defaultLoopSegment", () => {
  it("spans the middle three-fifths of the video", () => {
    expect(defaultLoopSegment(100)).toEqual({ start: 20, end: 80 });
  });

  it("uses the configured fraction on each side", () => {
    expect(DEFAULT_LOOP_FRACTION).toBe(0.2);
    expect(defaultLoopSegment(10)).toEqual({ start: 2, end: 8 });
  });

  it("normalizes a zero-duration video to a minimum-length segment", () => {
    const seg = defaultLoopSegment(0);
    expect(seg.start).toBe(0);
    expect(seg.end).toBeCloseTo(0.1, 5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run features/playback/reducer.test.ts`
Expected: FAIL — `defaultLoopSegment` is not exported.

- [ ] **Step 3: Implement**

In `features/playback/reducer.ts`, after `PLAYBACK_RATE_STEP`:

```ts
// A fresh video with no saved loops seeds its loop to the middle three-fifths,
// skipping a fifth of intro and a fifth of outro.
export const DEFAULT_LOOP_FRACTION = 0.2;

export function defaultLoopSegment(duration: number): LoopSegment {
  return normalizeLoopSegment({
    start: duration * DEFAULT_LOOP_FRACTION,
    end: duration * (1 - DEFAULT_LOOP_FRACTION)
  });
}
```

(`normalizeLoopSegment` is already defined below this point in the file; function declarations hoist, so the call resolves.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run features/playback/reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/playback/reducer.ts features/playback/reducer.test.ts
git commit -m "feat: defaultLoopSegment seeds the middle three-fifths"
```

---

## Task 4: SavedLoopsPopover component

**Files:**
- Create: `features/player-overlay/SavedLoopsPopover.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// features/player-overlay/SavedLoopsPopover.tsx
import { useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { SavedLoop } from "../persistence/loopStore";

type Props = {
  loops: SavedLoop[];
  selectedId: string | null;
  dirty: boolean;
  onSaveAsNew: (name: string) => void;
  onUpdateSelected: () => void;
  onApply: (id: string) => void;
  onReplace: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function SavedLoopsPopover({
  loops,
  selectedId,
  dirty,
  onSaveAsNew,
  onUpdateSelected,
  onApply,
  onReplace,
  onRename,
  onDelete
}: Props) {
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const selected = loops.find((l) => l.id === selectedId) ?? null;

  const commitNew = () => {
    const name = newName.trim();
    if (name === "") return;
    onSaveAsNew(name);
    setNewName("");
  };

  const commitRename = (id: string) => {
    const name = renameText.trim();
    if (name !== "") onRename(id, name);
    setRenamingId(null);
  };

  return (
    <div
      className="you-loop-loops-popover"
      role="dialog"
      aria-label="Saved loops"
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={swallow}
    >
      <div className="you-loop-loops-new">
        <input
          className="you-loop-loops-input"
          type="text"
          placeholder="Name this loop"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitNew();
            }
          }}
        />
        <button
          type="button"
          className="you-loop-loops-save"
          disabled={newName.trim() === ""}
          onClick={(e) => {
            swallow(e);
            commitNew();
          }}
        >
          Save as new
        </button>
      </div>

      {selected && dirty && (
        <button
          type="button"
          className="you-loop-loops-update"
          onClick={(e) => {
            swallow(e);
            onUpdateSelected();
          }}
        >
          Update “{selected.name}”
        </button>
      )}

      <ul className="you-loop-loops-list">
        {loops.length === 0 && (
          <li className="you-loop-loops-empty">No saved loops yet.</li>
        )}
        {loops.map((loop) => (
          <li
            key={loop.id}
            className="you-loop-loops-row"
            data-selected={loop.id === selectedId}
          >
            {renamingId === loop.id ? (
              <input
                className="you-loop-loops-input"
                type="text"
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => commitRename(loop.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitRename(loop.id);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setRenamingId(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="you-loop-loops-name"
                onClick={(e) => {
                  swallow(e);
                  onApply(loop.id);
                }}
              >
                {loop.name}
                {loop.id === selectedId && dirty && (
                  <span className="you-loop-loops-dirty" aria-hidden="true" />
                )}
              </button>
            )}

            <span className="you-loop-loops-actions">
              <button
                type="button"
                aria-label={`Replace ${loop.name} with the current loop`}
                title="Replace with current"
                onClick={(e) => {
                  swallow(e);
                  onReplace(loop.id);
                }}
              >
                ⤓
              </button>
              <button
                type="button"
                aria-label={`Rename ${loop.name}`}
                title="Rename"
                onClick={(e) => {
                  swallow(e);
                  setRenamingId(loop.id);
                  setRenameText(loop.name);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                aria-label={`Delete ${loop.name}`}
                title="Delete"
                onClick={(e) => {
                  swallow(e);
                  onDelete(loop.id);
                }}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add features/player-overlay/SavedLoopsPopover.tsx
git commit -m "feat: saved-loops popover component"
```

---

## Task 5: LoopPanel — saved-loops button + popover wiring

**Files:**
- Modify: `features/player-overlay/LoopPanel.tsx`

- [ ] **Step 1: Add imports and props**

At the top of `LoopPanel.tsx`, add:

```tsx
import { SavedLoopsPopover } from "./SavedLoopsPopover";
import type { SavedLoop } from "../persistence/loopStore";
```

Extend the `Props` type with:

```tsx
  canSaveLoops: boolean;
  loopsOpen: boolean;
  loopsDirty: boolean;
  savedLoops: SavedLoop[];
  selectedLoopId: string | null;
  onToggleLoopsPopover: () => void;
  onSaveAsNew: (name: string) => void;
  onUpdateSelected: () => void;
  onApplyLoop: (id: string) => void;
  onReplaceLoop: (id: string) => void;
  onRenameLoop: (id: string, name: string) => void;
  onDeleteLoop: (id: string) => void;
```

Add the same names to the destructured params in the function signature.

- [ ] **Step 2: Add the button + popover**

Insert this block immediately before the help-toggle button (the `you-loop-help-toggle` button near the end of the panel):

```tsx
      <div className="you-loop-loops">
        <button
          type="button"
          className="you-loop-loops-toggle"
          aria-haspopup="dialog"
          aria-expanded={loopsOpen}
          aria-label="Saved loops"
          data-dirty={loopsDirty}
          disabled={!canSaveLoops}
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(event) => {
            swallow(event);
            onToggleLoopsPopover();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M7 4h10v16l-5-3.5L7 20z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {loopsOpen && canSaveLoops && (
          <SavedLoopsPopover
            loops={savedLoops}
            selectedId={selectedLoopId}
            dirty={loopsDirty}
            onSaveAsNew={onSaveAsNew}
            onUpdateSelected={onUpdateSelected}
            onApply={onApplyLoop}
            onReplace={onReplaceLoop}
            onRename={onRenameLoop}
            onDelete={onDeleteLoop}
          />
        )}
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `pageUi.tsx` (LoopPanel now requires new props) — those are fixed in Task 6. `LoopPanel.tsx` and `SavedLoopsPopover.tsx` themselves must be clean. If you want a clean run now, proceed to Task 6 before typechecking.

- [ ] **Step 4: Commit**

```bash
git add features/player-overlay/LoopPanel.tsx
git commit -m "feat: saved-loops button + popover in loop panel"
```

---

## Task 6: pageUi — videoId, loadForVideo, save actions, navigation

**Files:**
- Modify: `entrypoints/content/pageUi.tsx`

- [ ] **Step 1: Add imports**

Add near the existing imports:

```tsx
import {
  addLoop,
  loadEntry,
  removeLoop,
  renameLoop,
  setLastUsed,
  updateLoop,
  type SavedLoop
} from "../../features/persistence/loopStore";
import { defaultLoopSegment } from "../../features/playback/reducer";
```

Add a helper near the top-level helpers (next to `getVideoDuration`):

```tsx
// The watch page's video id, or null off a watch page (saving disabled then).
function currentVideoId(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

// Loop positions match within rounding tolerance (segments round to 3 dp).
function segmentsEqual(a: LoopSegment | null, b: LoopSegment | null): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a.start - b.start) < 1e-3 && Math.abs(a.end - b.end) < 1e-3;
}
```

- [ ] **Step 2: Add closure state**

Inside `renderTimelineCursors`, alongside `let zoomed = false;` etc., add:

```tsx
  let videoId: string | null = currentVideoId();
  let savedLoops: SavedLoop[] = [];
  let selectedLoopId: string | null = null;
  let loopsOpen = false;
```

- [ ] **Step 3: Add dirty + load + save helpers**

Add these inside `renderTimelineCursors` (above `render`):

```tsx
  // Dirty = a saved loop is selected and the live positions differ from it.
  const isLoopsDirty = (): boolean => {
    if (selectedLoopId == null) return false;
    const loop = savedLoops.find((l) => l.id === selectedLoopId);
    if (loop == null) return true;
    return (
      !segmentsEqual(loop.main, state.loopSegment) ||
      !segmentsEqual(loop.zoom, zoomLoop)
    );
  };

  // Seed or restore positions for the current video. Runs on mount and on
  // navigation. Gated on a known duration so percentage seeding is meaningful.
  const loadForVideo = async () => {
    const id = videoId;
    const duration = getVideoDuration(video);
    if (duration <= 0) return; // retried on loadedmetadata/durationchange

    if (id == null) {
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: defaultLoopSegment(duration)
      });
      savedLoops = [];
      selectedLoopId = null;
      render();
      return;
    }

    const entry = await loadEntry(id);
    if (videoId !== id) return; // navigated away mid-await

    if (entry != null && entry.loops.length > 0) {
      const loop =
        entry.loops.find((l) => l.id === entry.lastUsedId) ?? entry.loops[0];
      savedLoops = entry.loops;
      selectedLoopId = loop.id;
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: loop.main
      });
      zoomLoop =
        loop.zoom != null && state.loopSegment != null
          ? clampLoopToRegion(loop.zoom, state.loopSegment)
          : null;
    } else {
      savedLoops = [];
      selectedLoopId = null;
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: defaultLoopSegment(duration)
      });
      zoomLoop = null;
    }
    render();
  };

  const saveAsNew = async (name: string) => {
    if (videoId == null || state.loopSegment == null) return;
    const loop = await addLoop(videoId, name, state.loopSegment, zoomLoop);
    savedLoops = [...savedLoops, loop];
    selectedLoopId = loop.id;
    loopsOpen = false;
    render();
  };

  const updateSelected = async () => {
    if (videoId == null || selectedLoopId == null || state.loopSegment == null)
      return;
    await updateLoop(videoId, selectedLoopId, state.loopSegment, zoomLoop);
    savedLoops = savedLoops.map((l) =>
      l.id === selectedLoopId
        ? { ...l, main: state.loopSegment!, zoom: zoomLoop }
        : l
    );
    render();
  };

  const replaceLoop = async (id: string) => {
    if (videoId == null || state.loopSegment == null) return;
    await updateLoop(videoId, id, state.loopSegment, zoomLoop);
    savedLoops = savedLoops.map((l) =>
      l.id === id ? { ...l, main: state.loopSegment!, zoom: zoomLoop } : l
    );
    selectedLoopId = id;
    render();
  };

  const applyLoop = async (id: string) => {
    const loop = savedLoops.find((l) => l.id === id);
    if (loop == null) return;
    selectedLoopId = id;
    state = playbackReducer(state, {
      type: "setLoopSegment",
      segment: loop.main
    });
    zoomLoop =
      loop.zoom != null && state.loopSegment != null
        ? clampLoopToRegion(loop.zoom, state.loopSegment)
        : null;
    if (videoId != null) await setLastUsed(videoId, id);
    loopsOpen = false;
    render();
  };

  const renameSavedLoop = async (id: string, name: string) => {
    if (videoId == null) return;
    await renameLoop(videoId, id, name);
    savedLoops = savedLoops.map((l) => (l.id === id ? { ...l, name } : l));
    render();
  };

  const deleteSavedLoop = async (id: string) => {
    if (videoId == null) return;
    await removeLoop(videoId, id);
    savedLoops = savedLoops.filter((l) => l.id !== id);
    if (selectedLoopId === id) selectedLoopId = null;
    render();
  };

  const toggleLoopsPopover = () => {
    loopsOpen = !loopsOpen;
    render();
  };
```

- [ ] **Step 4: Replace `enableLoop` seeding**

Change `enableLoop` so it no longer seeds (positions come from `loadForVideo`):

```tsx
  const enableLoop = () => {
    if (state.loopSegment == null) {
      // Fallback: loadForVideo normally seeds before the user can enable, but
      // guard against an unknown-duration race.
      state = playbackReducer(state, {
        type: "setLoopSegment",
        segment: defaultLoopSegment(getVideoDuration(video))
      });
    }
    state = playbackReducer(state, { type: "setLoopEnabled", enabled: true });
  };
```

- [ ] **Step 5: Pass new props to LoopPanel**

In the `render` function's `<LoopPanel .../>`, add these props:

```tsx
          canSaveLoops={state.loopEnabled && videoId != null}
          loopsOpen={loopsOpen}
          loopsDirty={isLoopsDirty()}
          savedLoops={savedLoops}
          selectedLoopId={selectedLoopId}
          onToggleLoopsPopover={toggleLoopsPopover}
          onSaveAsNew={saveAsNew}
          onUpdateSelected={updateSelected}
          onApplyLoop={applyLoop}
          onReplaceLoop={replaceLoop}
          onRenameLoop={renameSavedLoop}
          onDeleteLoop={deleteSavedLoop}
```

- [ ] **Step 6: Trigger load on mount + navigation + metadata**

Just before the existing `render();` at the end of setup (after the event listeners are attached), add:

```tsx
  const onLoadedMetadata = () => {
    void loadForVideo();
  };
  const onNavigate = () => {
    const next = currentVideoId();
    if (next === videoId) return;
    videoId = next;
    selectedLoopId = null;
    savedLoops = [];
    loopsOpen = false;
    void loadForVideo();
  };
  video.addEventListener("loadedmetadata", onLoadedMetadata);
  video.addEventListener("durationchange", onLoadedMetadata);
  document.addEventListener("yt-navigate-finish", onNavigate);

  void loadForVideo();
```

And in the returned `stop()`, add the matching removals:

```tsx
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onLoadedMetadata);
      document.removeEventListener("yt-navigate-finish", onNavigate);
```

- [ ] **Step 7: Typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean; all existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add entrypoints/content/pageUi.tsx
git commit -m "feat: per-video saved-loop seeding, restore, and save actions"
```

---

## Task 7: Styles for the saved-loops UI

**Files:**
- Modify: `entrypoints/content/pageUi.tsx` (`ensureDocumentStyles`)

- [ ] **Step 1: Add styles**

Inside the template string in `ensureDocumentStyles`, append before the closing backtick:

```css
    .you-loop-loops {
      position: relative;
    }

    .you-loop-loops-toggle {
      align-items: center;
      background: transparent;
      border: 0;
      color: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      display: inline-flex;
      height: 24px;
      justify-content: center;
      padding: 0;
      width: 24px;
    }

    .you-loop-loops-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-loops-toggle:not(:disabled):hover {
      color: #ffffff;
    }

    .you-loop-loops-toggle:disabled {
      cursor: default;
      opacity: 0.4;
    }

    /* Unsaved-changes dot on the toggle. */
    .you-loop-loops-toggle[data-dirty="true"]::after {
      background: #5eead4;
      border-radius: 50%;
      content: "";
      height: 5px;
      position: absolute;
      right: 1px;
      top: 1px;
      width: 5px;
    }

    .you-loop-loops-popover {
      background: rgba(18, 18, 18, 0.97);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      bottom: calc(100% + 10px);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
      color: #fff;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      pointer-events: auto;
      position: absolute;
      right: 0;
      width: 240px;
      z-index: 2;
    }

    .you-loop-loops-new {
      display: flex;
      gap: 6px;
    }

    .you-loop-loops-input {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      color: #fff;
      flex: 1;
      font-size: 12px;
      min-width: 0;
      padding: 5px 7px;
    }

    .you-loop-loops-save,
    .you-loop-loops-update {
      background: rgba(94, 234, 212, 0.16);
      border: 0;
      border-radius: 6px;
      color: #5eead4;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 8px;
      white-space: nowrap;
    }

    .you-loop-loops-save:disabled {
      cursor: default;
      opacity: 0.45;
    }

    .you-loop-loops-update {
      text-align: left;
    }

    .you-loop-loops-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      list-style: none;
      margin: 0;
      max-height: 200px;
      overflow-y: auto;
      padding: 0;
    }

    .you-loop-loops-empty {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      padding: 4px 2px;
    }

    .you-loop-loops-row {
      align-items: center;
      border-radius: 6px;
      display: flex;
      gap: 6px;
      padding: 2px 4px;
    }

    .you-loop-loops-row[data-selected="true"] {
      background: rgba(255, 255, 255, 0.08);
    }

    .you-loop-loops-name {
      align-items: center;
      background: transparent;
      border: 0;
      color: #fff;
      cursor: pointer;
      display: flex;
      flex: 1;
      font-size: 12.5px;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
      padding: 3px 2px;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .you-loop-loops-dirty {
      background: #5eead4;
      border-radius: 50%;
      flex: none;
      height: 5px;
      width: 5px;
    }

    .you-loop-loops-actions {
      display: inline-flex;
      gap: 2px;
    }

    .you-loop-loops-actions button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      padding: 4px 5px;
    }

    .you-loop-loops-actions button:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/pageUi.tsx
git commit -m "style: saved-loops popover and toggle"
```

---

## Task 8: HelpModal — control entry + Memory note

**Files:**
- Modify: `features/player-overlay/HelpModal.tsx`

- [ ] **Step 1: Add a bookmark glyph constant**

Near the other icon constants (`ZoomIcon` etc.), add:

```tsx
const SaveIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M7 4h10v16l-5-3.5L7 20z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);
```

- [ ] **Step 2: Add the control to the CONTROLS list**

Append to the `CONTROLS` array:

```tsx
  {
    icon: SaveIcon,
    term: "Saved loops",
    desc: "Save the current loop and zoom as a named loop for this video; keep several per video, replace or rename them anytime."
  }
```

- [ ] **Step 3: Add the Memory note**

After the closing `</section>` of the Keyboard section (before the final closing tags of the card), add:

```tsx
        <section className="you-loop-help-section">
          <h3 className="you-loop-help-label">Memory</h3>
          <p className="you-loop-help-note">
            Saved loops restore automatically when you return to a video — the
            last one you used applies. The last 200 videos are kept; past that
            the oldest is dropped first, and revisiting a video moves it back to
            newest so it survives longer.
          </p>
        </section>
```

- [ ] **Step 4: Add a style for the note**

In `ensureDocumentStyles` in `pageUi.tsx`, near the other `.you-loop-help-*` rules, add:

```css
    .you-loop-help-note {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 0;
    }
```

- [ ] **Step 5: Typecheck + run existing HelpModal tests**

Run: `npm run typecheck && npx vitest run features/player-overlay/HelpModal.test.tsx`
Expected: clean / pass. If a test asserts an exact control count, update it to include "Saved loops".

- [ ] **Step 6: Commit**

```bash
git add features/player-overlay/HelpModal.tsx entrypoints/content/pageUi.tsx
git commit -m "docs: saved-loops help entry and memory note"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the whole suite + typecheck + build**

Run: `npm run typecheck && npm run test && npm run build`
Expected: all green.

- [ ] **Step 2: Manual smoke (optional, via the run skill)**

Load a YouTube video, enable the loop, save a named loop, reload/navigate, confirm it restores and the list works.

- [ ] **Step 3: Commit any test fixups**

```bash
git add -A
git commit -m "test: fixups after saved-loops verification"
```

---

## Self-Review Notes

- **Spec coverage:** default range (Task 3), storage layer + LRU + touch-on-access (Tasks 1–2), videoId/load/restore (Task 6), save-as-new + update + replace + rename + delete + apply (Tasks 4–6), popover UI (Tasks 4–5, 7), docs + memory note (Task 8), tests (Tasks 1–3, 8–9). All spec sections mapped.
- **Type consistency:** `loadEntry/addLoop/updateLoop/renameLoop/removeLoop/setLastUsed`, `SavedLoop`, `VideoEntry`, `StorageArea`, `defaultLoopSegment`, `DEFAULT_LOOP_FRACTION` used identically across tasks. Popover prop names match LoopPanel and pageUi handlers.
- **No placeholders:** every code step contains full code.
