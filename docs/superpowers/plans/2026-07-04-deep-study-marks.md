# Deep-Study Practice Marks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shift-clickable practice marks on the zoom strip that set a temporary loop start — playback loops `[mark, loop end]`, restart keys start from the mark, clicking the mark again restores the whole loop. Marks persist with saved loops.

**Architecture:** Marks live as closure state in `renderTimelineCursors` (`entrypoints/content/pageUi.tsx`), beside `zoomLoop` — the existing precedent for loop refinements outside the playback reducer. A pure module (`features/playback/marks.ts`) owns the semantics; the single playback hook is `effectiveSegment()`, which every consumer (A/S/D keys, loop-wrap enforcement, count-in, one-shot) already reads. `ZoomTimeline` renders the markers and gestures. `SavedLoop` gains an optional `marks?: number[]` field following the `countIn` pattern.

**Tech Stack:** TypeScript, React 19, WXT browser extension, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-04-deep-study-design.md`

## Global Constraints

- Marks are absolute video times in seconds, rounded to 3dp, kept sorted and deduped.
- A mark is *inert* (ignored by playback, rendered dimmed) unless `loop.start < mark ≤ loop.end − MIN_SEGMENT_DURATION_SECONDS` (0.1s, from `features/playback/reducer.ts:10`) — the mark→end loop must never violate the minimum loop length.
- The active mark affects playback **only while zoom is open**; closing zoom reverts to the main loop but retains `marks`/`activeMark`.
- `activeMark` is never persisted. `marks` persists on `SavedLoop` as an optional field — no migration; legacy loops simply lack it.
- All pointer handlers on new zoom-strip elements must `preventDefault`/`stopPropagation` so nothing leaks into YouTube's player (same discipline as the existing loop cursors).
- Zero changes to `features/playback/shortcuts.ts` and `features/playback/controller.ts`.
- Run tests with `pnpm vitest run <file>`; full suite `pnpm test`; types `pnpm typecheck`.

---

### Task 1: Pure marks module

**Files:**
- Create: `features/playback/marks.ts`
- Test: `features/playback/marks.test.ts`

**Interfaces:**
- Consumes: `LoopSegment` from `features/playback/types.ts`, `MIN_SEGMENT_DURATION_SECONDS` from `features/playback/reducer.ts`.
- Produces (later tasks rely on these exact signatures):
  - `addMark(marks: number[], time: number): number[]`
  - `removeMark(marks: number[], time: number): number[]`
  - `resolveSegment(base: LoopSegment | null, activeMark: number | null): LoopSegment | null`
  - `isInertMark(time: number, loop: LoopSegment): boolean`
  - `marksEqual(a: number[] | undefined, b: number[] | undefined): boolean`
  - `sanitizeMarks(value: unknown): number[]`

- [ ] **Step 1: Write the failing tests**

Create `features/playback/marks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addMark,
  removeMark,
  resolveSegment,
  isInertMark,
  marksEqual,
  sanitizeMarks
} from "./marks";

describe("addMark", () => {
  it("inserts keeping sort order", () => {
    expect(addMark([10, 30], 20)).toEqual([10, 20, 30]);
  });

  it("rounds to 3dp", () => {
    expect(addMark([], 1.23456)).toEqual([1.235]);
  });

  it("dedupes an existing time (post-rounding)", () => {
    expect(addMark([1.235], 1.2351)).toEqual([1.235]);
  });

  it("does not mutate the input array", () => {
    const input = [10];
    addMark(input, 5);
    expect(input).toEqual([10]);
  });
});

describe("removeMark", () => {
  it("removes the given time", () => {
    expect(removeMark([10, 20, 30], 20)).toEqual([10, 30]);
  });

  it("is a no-op for an unknown time", () => {
    expect(removeMark([10], 99)).toEqual([10]);
  });
});

describe("resolveSegment", () => {
  const base = { start: 10, end: 20 };

  it("returns base unchanged when activeMark is null", () => {
    expect(resolveSegment(base, null)).toBe(base);
  });

  it("passes null base through", () => {
    expect(resolveSegment(null, 15)).toBeNull();
  });

  it("swaps the start when the mark is inside the base", () => {
    expect(resolveSegment(base, 15)).toEqual({ start: 15, end: 20 });
  });

  it("ignores a mark at or before the base start", () => {
    expect(resolveSegment(base, 10)).toBe(base);
    expect(resolveSegment(base, 5)).toBe(base);
  });

  it("ignores a mark that leaves less than the minimum loop length", () => {
    // MIN_SEGMENT_DURATION_SECONDS = 0.1 — a mark at 19.95 leaves only 0.05s.
    expect(resolveSegment(base, 19.95)).toBe(base);
    // Exactly at end − 0.1 is allowed.
    expect(resolveSegment(base, 19.9)).toEqual({ start: 19.9, end: 20 });
  });
});

describe("isInertMark", () => {
  const loop = { start: 10, end: 20 };

  it("live strictly inside the loop", () => {
    expect(isInertMark(15, loop)).toBe(false);
  });

  it("inert at/below start and in the too-short tail", () => {
    expect(isInertMark(10, loop)).toBe(true);
    expect(isInertMark(8, loop)).toBe(true);
    expect(isInertMark(19.95, loop)).toBe(true);
    expect(isInertMark(25, loop)).toBe(true);
  });
});

describe("marksEqual", () => {
  it("treats undefined as empty", () => {
    expect(marksEqual(undefined, [])).toBe(true);
    expect(marksEqual(undefined, undefined)).toBe(true);
    expect(marksEqual(undefined, [1])).toBe(false);
  });

  it("compares element-wise", () => {
    expect(marksEqual([1, 2], [1, 2])).toBe(true);
    expect(marksEqual([1, 2], [1, 3])).toBe(false);
    expect(marksEqual([1], [1, 2])).toBe(false);
  });
});

describe("sanitizeMarks", () => {
  it("passes a clean array through sorted and deduped", () => {
    expect(sanitizeMarks([30, 10, 10])).toEqual([10, 30]);
  });

  it("drops non-finite, non-positive, and non-number entries", () => {
    expect(sanitizeMarks([5, NaN, Infinity, -1, 0, "x", null])).toEqual([5]);
  });

  it("returns [] for a non-array", () => {
    expect(sanitizeMarks("garbage")).toEqual([]);
    expect(sanitizeMarks(null)).toEqual([]);
    expect(sanitizeMarks(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/playback/marks.test.ts`
Expected: FAIL — `Cannot find module './marks'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `features/playback/marks.ts`:

```ts
import type { LoopSegment } from "./types";
import { MIN_SEGMENT_DURATION_SECONDS } from "./reducer";

// Deep-study practice marks: absolute video times (seconds) inside the loop.
// Clicking one on the zoom strip makes it a temporary loop start — playback
// then loops [mark, loop end] until it is clicked off. Times are pinned to
// 3dp (same discipline as normalizeLoopSegment) so equality checks — the
// toggle/remove hit-tests and the saved-loop dirty compare — are exact.

const round3 = (time: number): number => Number(time.toFixed(3));

// Insert `time` keeping the list sorted; a duplicate (post-rounding) is a
// no-op. Never mutates the input.
export function addMark(marks: number[], time: number): number[] {
  const t = round3(time);
  if (marks.includes(t)) return [...marks];
  return [...marks, t].sort((a, b) => a - b);
}

export function removeMark(marks: number[], time: number): number[] {
  return marks.filter((m) => m !== time);
}

// True when the mark cannot act as a loop start inside `loop`: at/before the
// start, or so close to the end that [mark, end] would violate the minimum
// loop length. Inert marks stay stored and rendered (dimmed) but are ignored
// by playback.
export function isInertMark(time: number, loop: LoopSegment): boolean {
  return time <= loop.start || time > loop.end - MIN_SEGMENT_DURATION_SECONDS;
}

// The segment playback obeys: with a live active mark inside `base`, the loop
// starts at the mark; otherwise `base` unchanged (including base == null).
export function resolveSegment(
  base: LoopSegment | null,
  activeMark: number | null
): LoopSegment | null {
  if (base == null || activeMark == null) return base;
  if (isInertMark(activeMark, base)) return base;
  return { start: activeMark, end: base.end };
}

// Element-wise compare for the saved-loop dirty check. Legacy loops lack the
// marks field entirely — undefined counts as empty.
export function marksEqual(
  a: number[] | undefined,
  b: number[] | undefined
): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// Storage-read boundary (same role as sanitizeCountInSettings): a corrupt
// sync write can never reach playback. Keeps finite positive numbers only,
// deduped and sorted.
export function sanitizeMarks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const clean = value.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
  );
  return [...new Set(clean)].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/playback/marks.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add features/playback/marks.ts features/playback/marks.test.ts
git commit -m "feat(deep-study): pure marks module — add/remove/resolve/sanitize"
```

---

### Task 2: Persist marks on SavedLoop

**Files:**
- Modify: `features/persistence/loopStore.ts` (type at :16, `sanitizeEntry` at :79, `addLoop` at :189, `updateLoop` patch type at :243)
- Test: `features/persistence/loopStore.test.ts`

**Interfaces:**
- Consumes: `sanitizeMarks` from Task 1 (`features/playback/marks.ts`).
- Produces:
  - `SavedLoop` gains `marks?: number[]`.
  - `addLoop(videoId, name, main, zoom, countIn?, marks?, storage?, now?)` — **`marks` inserted as the 6th parameter, before `storage`**.
  - `updateLoop` patch type becomes `Partial<Pick<SavedLoop, "name" | "main" | "zoom" | "countIn" | "marks">>`.

- [ ] **Step 1: Write the failing tests**

Add to `features/persistence/loopStore.test.ts` (inside the existing `describe("loopStore", ...)` block). Note: this step also updates the ~17 existing positional `addLoop(...)` calls — every call that passes `storage`/`now` gains a `null` marks argument before them, e.g. `addLoop("v", "A", seg(1, 2), null, null, sync(area), 10)` becomes `addLoop("v", "A", seg(1, 2), null, null, null, sync(area), 10)` (and the same inside `seedTwo`).

```ts
  it("round-trips marks through add and load", async () => {
    const area = makeArea();
    await addLoop("vid", "A", seg(1, 9), null, null, [2, 5.5], sync(area), 1);
    const entry = await loadEntry("vid", sync(area));
    expect(entry?.loops[0].marks).toEqual([2, 5.5]);
  });

  it("loads a legacy loop without a marks field cleanly", async () => {
    const area = makeArea();
    await addLoop("vid", "A", seg(1, 9), null, null, undefined, sync(area), 1);
    const entry = await loadEntry("vid", sync(area));
    expect(entry?.loops[0].marks).toBeUndefined();
  });

  it("sanitizes corrupt marks on read", async () => {
    const area = makeArea();
    const loop = await addLoop("vid", "A", seg(1, 9), null, null, [2], sync(area), 1);
    // Corrupt the stored entry directly, as a bad sync write would.
    const raw = area.raw("vid")!;
    raw.loops = [{ ...loop, marks: [9, NaN, -3, 9, "x"] as unknown as number[] }];
    const entry = await loadEntry("vid", sync(area));
    expect(entry?.loops[0].marks).toEqual([9]);
  });

  it("updateLoop can overwrite marks", async () => {
    const area = makeArea();
    const loop = await addLoop("vid", "A", seg(1, 9), null, null, [2], sync(area), 1);
    await updateLoop("vid", loop.id, { marks: [3, 4] }, sync(area));
    const entry = await loadEntry("vid", sync(area));
    expect(entry?.loops[0].marks).toEqual([3, 4]);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run features/persistence/loopStore.test.ts`
Expected: FAIL — type errors on the new `addLoop` arity / `marks` property until the store changes land.

- [ ] **Step 3: Implement the store changes**

In `features/persistence/loopStore.ts`:

Add the import (top of file, beside the existing playback import):

```ts
import { sanitizeMarks } from "../playback/marks";
```

Extend `SavedLoop` (after the `countIn` field):

```ts
  // Deep-study practice marks (absolute times, seconds). Absent on legacy
  // loops and loops saved without marks — no migration; they load cleanly.
  marks?: number[];
```

Extend `sanitizeEntry`:

```ts
function sanitizeEntry(entry: VideoEntry): VideoEntry {
  return {
    ...entry,
    loops: entry.loops.map((loop) => {
      let next = loop;
      if (next.countIn != null) {
        next = { ...next, countIn: sanitizeCountInSettings(next.countIn) };
      }
      if (next.marks != null) {
        next = { ...next, marks: sanitizeMarks(next.marks) };
      }
      return next;
    })
  };
}
```

Extend `addLoop` — `marks` becomes the 6th parameter:

```ts
export async function addLoop(
  videoId: string,
  name: string,
  main: LoopSegment,
  zoom: LoopSegment | null,
  countIn?: CountInSettings | null,
  marks?: number[] | null,
  storage?: Partial<LoopStorage>,
  now: number = Date.now()
): Promise<SavedLoop> {
  const s = resolveStorage(storage);
  const existing = await readEntry(s, videoId);
  const loop: SavedLoop = {
    id: crypto.randomUUID(),
    name,
    main,
    zoom,
    countIn,
    ...(marks != null ? { marks } : {})
  };
  const entry: VideoEntry = existing
    ? { ...existing, loops: [...existing.loops, loop], lastUsedId: loop.id }
    : { loops: [loop], lastUsedId: loop.id, addedAt: now };
  await writeEntry(s, videoId, entry);
  return loop;
}
```

Extend the `updateLoop` patch type (signature only — the body already spreads the patch):

```ts
  patch: Partial<Pick<SavedLoop, "name" | "main" | "zoom" | "countIn" | "marks">>,
```

Update the one production callsite now so the build stays green: in `entrypoints/content/pageUi.tsx` `saveAsNew` (line ~496), the `addLoop` call passes `undefined` for marks for now (Task 4 threads the real value):

```ts
    const loop = await addLoop(
      videoId,
      name,
      state.loopSegment,
      zoomLoop,
      countInSettings,
      undefined
    );
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run features/persistence/loopStore.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add features/persistence/loopStore.ts features/persistence/loopStore.test.ts entrypoints/content/pageUi.tsx
git commit -m "feat(deep-study): persist optional marks on SavedLoop"
```

---

### Task 3: ZoomTimeline markers — rendering + gestures + styles

**Files:**
- Modify: `features/player-overlay/ZoomTimeline.tsx`
- Modify: `entrypoints/content/pageUi.styles.ts` (insert after the `.you-loop-zoom-cursor` block, ~line 1283)
- Test: `features/player-overlay/ZoomTimeline.test.tsx`

**Interfaces:**
- Consumes: `isInertMark` from Task 1; existing `formatTime`, `formatTimePrecise`, `blockMouse`, `timeFromPointer`, `pct`.
- Produces — new optional `ZoomTimeline` props (Task 4 wires them):
  - `marks?: number[]`
  - `activeMark?: number | null`
  - `onAddMark?: (time: number) => void`
  - `onToggleMark?: (time: number) => void`
  - `onRemoveMark?: (time: number) => void`
- DOM contract for tests/styles: marker buttons have class `you-loop-zoom-mark`, `data-active="true"` when active, `data-inert="true"` when inert, aria-label `Practice mark at <m:ss>`; active-drill fill has class `you-loop-zoom-drill-fill`.

- [ ] **Step 1: Write the failing tests**

Add to `features/player-overlay/ZoomTimeline.test.tsx`. Extend `setup()` to accept and pass the new props (keep existing callers working):

```ts
function setup(extra: Partial<Parameters<typeof ZoomTimeline>[0]> = {}) {
  const video = makeVideo();
  const onLoopChange = vi.fn();
  const onWindowMove = vi.fn();

  render(
    <ZoomTimeline
      video={video}
      window={{ start: 20, end: 40 }}
      loop={{ start: 25, end: 30 }}
      onLoopChange={onLoopChange}
      onWindowMove={onWindowMove}
      {...extra}
    />
  );
  // ... rest unchanged (track rect stub, cursor lookups, setPointerCapture stubs)
```

Then append the new suite:

```ts
describe("ZoomTimeline practice marks", () => {
  it("shift+pointerdown on the track adds a mark at the pointer time and does not scrub", () => {
    const onAddMark = vi.fn();
    const { video, track } = setup({ marks: [], onAddMark });

    // 1px == 1s in the [20,40] window; clientX=7 → 27s.
    act(() => {
      fireEvent.pointerDown(track, { pointerId: 1, clientX: 7, shiftKey: true });
    });

    expect(onAddMark).toHaveBeenCalledWith(27);
    expect(video.pause).not.toHaveBeenCalled(); // scrub path pauses; add must not
  });

  it("plain pointerdown on the track still scrubs", () => {
    const onAddMark = vi.fn();
    const { video, track } = setup({ marks: [], onAddMark });

    act(() => {
      fireEvent.pointerDown(track, { pointerId: 1, clientX: 7 });
      fireEvent.pointerUp(track, { pointerId: 1, clientX: 7 });
    });

    expect(onAddMark).not.toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
  });

  it("renders markers at their window position with active/inert state", () => {
    // loop = [25,30]: 26 live, 24 inert (before start), 29.95 inert (tail).
    setup({ marks: [24, 26, 29.95], activeMark: 26 });

    const live = screen.getByRole("button", { name: "Practice mark at 0:26" });
    expect(live.dataset.active).toBe("true");
    expect(live.dataset.inert).toBeUndefined();
    // 26s in [20,40] → 30% across the strip.
    expect(parseFloat(live.style.left)).toBeCloseTo(30, 5);

    const before = screen.getByRole("button", { name: "Practice mark at 0:24" });
    expect(before.dataset.inert).toBe("true");
    const tail = screen.getByRole("button", { name: /0:29/ });
    expect(tail.dataset.inert).toBe("true");
  });

  it("does not render marks outside the zoom window", () => {
    setup({ marks: [10, 26] }); // 10s is outside [20,40]
    expect(screen.queryByRole("button", { name: "Practice mark at 0:10" })).toBeNull();
    expect(screen.getByRole("button", { name: "Practice mark at 0:26" })).toBeInTheDocument();
  });

  it("click toggles, shift+click removes", () => {
    const onToggleMark = vi.fn();
    const onRemoveMark = vi.fn();
    setup({ marks: [26], onToggleMark, onRemoveMark });

    const mark = screen.getByRole("button", { name: "Practice mark at 0:26" });
    fireEvent.click(mark);
    expect(onToggleMark).toHaveBeenCalledWith(26);
    expect(onRemoveMark).not.toHaveBeenCalled();

    fireEvent.click(mark, { shiftKey: true });
    expect(onRemoveMark).toHaveBeenCalledWith(26);
    expect(onToggleMark).toHaveBeenCalledTimes(1);
  });

  it("pressing a marker does not start a track scrub", () => {
    const { video } = setup({ marks: [26] });
    const mark = screen.getByRole("button", { name: "Practice mark at 0:26" });
    act(() => {
      fireEvent.pointerDown(mark, { pointerId: 1, clientX: 6 });
    });
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("draws the drill fill from the active mark to the loop end", () => {
    setup({ marks: [26], activeMark: 26 });
    const fill = document.querySelector(".you-loop-zoom-drill-fill") as HTMLElement;
    expect(fill).not.toBeNull();
    // 26→30 in [20,40]: left 30%, width 20%.
    expect(parseFloat(fill.style.left)).toBeCloseTo(30, 5);
    expect(parseFloat(fill.style.width)).toBeCloseTo(20, 5);
  });

  it("draws no drill fill when the active mark is inert", () => {
    setup({ marks: [24], activeMark: 24 });
    expect(document.querySelector(".you-loop-zoom-drill-fill")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run features/player-overlay/ZoomTimeline.test.tsx`
Expected: new suite FAILS (unknown props / missing elements); existing suites still PASS.

- [ ] **Step 3: Implement the component changes**

In `features/player-overlay/ZoomTimeline.tsx`:

Add the import:

```ts
import { isInertMark } from "../playback/marks";
```

Extend `Props` (after `countIn`):

```ts
  // Deep-study practice marks (absolute times). A mark inside the loop can be
  // activated as a temporary loop start; the active one draws a drill fill to
  // the loop end. All optional — the strip works markless.
  marks?: number[];
  activeMark?: number | null;
  onAddMark?: (time: number) => void;
  onToggleMark?: (time: number) => void;
  onRemoveMark?: (time: number) => void;
```

Destructure with defaults in the component signature:

```ts
  marks = [],
  activeMark = null,
  onAddMark,
  onToggleMark,
  onRemoveMark,
```

Gate `onTrackPointerDown` — shift places a mark instead of scrubbing (first lines of the existing handler):

```ts
  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Shift+press drops a practice mark instead of scrubbing. The follow-up
    // synthesized click is swallowed by the track's existing onClick blockMouse.
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onAddMark?.(timeFromPointer(event.clientX));
      return;
    }
    scrubbingRef.current = true;
    // ... rest unchanged
```

Render, inside the track div — the drill fill right after the existing `you-loop-zoom-fill` div, the markers after the cursors (so a marker overlapping a cursor stays clickable via z-index, see styles):

```tsx
        {activeMark != null && !isInertMark(activeMark, loop) && (
          <div
            className="you-loop-zoom-drill-fill"
            style={{
              left: `${pct(activeMark)}%`,
              width: `${pct(loop.end) - pct(activeMark)}%`
            }}
          />
        )}
```

```tsx
        {marks
          .filter((time) => time >= win.start && time <= win.end)
          .map((time) => (
            <button
              key={time}
              type="button"
              className="you-loop-zoom-mark"
              data-active={activeMark === time ? "true" : undefined}
              data-inert={isInertMark(time, loop) ? "true" : undefined}
              aria-pressed={activeMark === time}
              aria-label={`Practice mark at ${formatTime(time)}`}
              style={{ left: `${pct(time)}%` }}
              // Do not let the press start a track scrub, and keep the
              // synthesized click out of YouTube's player.
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseDown={blockMouse}
              onClick={(event) => {
                blockMouse(event);
                if (event.shiftKey) onRemoveMark?.(time);
                else onToggleMark?.(time);
              }}
            >
              <span className="you-loop-handle-chip" aria-hidden="true">
                {formatTimePrecise(time)}
              </span>
            </button>
          ))}
```

Note: the drill fill and markers are positioned from committed props, so they can lag a live cursor drag by one commit — the loop fill/cursors repaint via refs during the drag, marks reposition on release. Acceptable; do not wire marks into `paintLoop`.

- [ ] **Step 4: Add the styles**

In `entrypoints/content/pageUi.styles.ts`, after the `.you-loop-zoom-cursor` rule block (~line 1283), insert:

```css
    /* Practice marks: a diamond-headed tick dropped on the zoom strip. Ivory
       like the playhead (teal is the loop's structural color); teal-lit when
       active, dimmed when outside the current loop. */
    .you-loop-zoom-mark {
      background: transparent;
      border: 0;
      cursor: pointer;
      height: 26px;
      margin: 0;
      padding: 0;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      transform: translate(-50%, -50%);
      width: 12px;
      /* Above the drill fill and playhead, below the loop cursors. */
      z-index: 1;
    }

    .you-loop-zoom-mark::before {
      background: rgba(242, 241, 237, 0.9);
      content: "";
      height: 14px;
      left: 50%;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      transition: background 0.15s ease;
      width: 2px;
    }

    .you-loop-zoom-mark::after {
      background: #f2f1ed;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
      content: "";
      height: 7px;
      left: 50%;
      position: absolute;
      top: -2px;
      transform: translateX(-50%) rotate(45deg);
      transition: background 0.15s ease, box-shadow 0.15s ease,
        transform 0.15s ease;
      width: 7px;
    }

    .you-loop-zoom-mark:hover::after {
      transform: translateX(-50%) rotate(45deg) scale(1.2);
    }

    .you-loop-zoom-mark:hover .you-loop-handle-chip {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .you-loop-zoom-mark[data-active="true"]::before {
      background: #2dd4bf;
    }

    .you-loop-zoom-mark[data-active="true"]::after {
      background: #2dd4bf;
      box-shadow: 0 0 6px rgba(20, 184, 166, 0.8),
        0 0 0 1px rgba(0, 0, 0, 0.4);
    }

    .you-loop-zoom-mark[data-inert="true"] {
      opacity: 0.35;
    }

    /* Brightened stripe from the active mark to the loop end — the region
       that actually plays while drilling. */
    .you-loop-zoom-drill-fill {
      background: rgba(94, 234, 212, 0.28);
      border-left: 2px solid #2dd4bf;
      height: 100%;
      pointer-events: none;
      position: absolute;
      top: 0;
      will-change: left, width;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run features/player-overlay/ZoomTimeline.test.tsx && pnpm typecheck`
Expected: PASS (new suite and all pre-existing suites), no type errors.

- [ ] **Step 6: Commit**

```bash
git add features/player-overlay/ZoomTimeline.tsx features/player-overlay/ZoomTimeline.test.tsx entrypoints/content/pageUi.styles.ts
git commit -m "feat(deep-study): practice-mark markers and gestures on the zoom strip"
```

---

### Task 4: pageUi wiring — state, playback hook, persistence flow

**Files:**
- Modify: `entrypoints/content/pageUi.tsx` (state ~:161, `effectiveSegment` :196, `seedDefaultLoop` :381, `applySavedEntry` :402, `saveAsNew` :494, `applyLoop` :512, `isLoopDirty` :101, `buildEditStorePatch` :120, `onNavigate` :864, render :629)
- Test: `entrypoints/content/pageUi.test.tsx`

**Interfaces:**
- Consumes: `addMark`, `removeMark`, `resolveSegment`, `marksEqual` from Task 1; `marks` field + `addLoop` 6th param from Task 2; `ZoomTimeline` mark props from Task 3.
- Produces: complete feature behavior — no exports change.

- [ ] **Step 1: Write the failing tests**

Add to `entrypoints/content/pageUi.test.tsx`. Reuses the existing helpers (`mountWatch`, `mountWithLoopEnabled`, `flushAsync`, `navigateTo`, `SAVED_ENTRY`, `keyFor`, `enableLoop`). The zoom toggle is `screen.getByLabelText("Show loop zoom timeline")`; the zoom track rect must be stubbed the same way the ZoomTimeline suite does.

```ts
describe("deep-study practice marks", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  // Enable the loop, open zoom, and stub the zoom track to 1px == 1s over the
  // default whole-video window [0,120] (rect width 120).
  async function mountZoomed() {
    const ctx = await mountWatch("vid1");
    act(() => enableLoop());
    act(() => {
      fireEvent.click(screen.getByLabelText("Show loop zoom timeline"));
    });
    const track = document.querySelector(".you-loop-zoom-track") as HTMLElement;
    track.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 30, right: 120, bottom: 30, x: 0, y: 0, toJSON() {} }) as DOMRect;
    track.setPointerCapture = () => {};
    return { ...ctx, track };
  }

  function addMarkAt(track: HTMLElement, clientX: number) {
    act(() => {
      fireEvent.pointerDown(track, { pointerId: 1, clientX, shiftKey: true });
    });
  }

  it("shift-click adds a mark; activating it makes A restart from the mark", async () => {
    const { video, track } = await mountZoomed();
    addMarkAt(track, 30); // mark at 30s

    const mark = screen.getByRole("button", { name: "Practice mark at 0:30" });
    fireEvent.click(mark);
    expect(mark.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      fireEvent.keyDown(document, { key: "a" });
      fireEvent.keyUp(document, { key: "a" });
    });
    expect(video.currentTime).toBe(30);
  });

  it("clicking the active mark deactivates it — A restarts from the loop start again", async () => {
    const { video, track } = await mountZoomed();
    addMarkAt(track, 30);
    const mark = screen.getByRole("button", { name: "Practice mark at 0:30" });
    fireEvent.click(mark); // activate
    fireEvent.click(mark); // deactivate
    expect(mark.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      fireEvent.keyDown(document, { key: "a" });
      fireEvent.keyUp(document, { key: "a" });
    });
    expect(video.currentTime).toBe(0); // whole-video default loop start
  });

  it("shift-clicking a mark removes it", async () => {
    const { track } = await mountZoomed();
    addMarkAt(track, 30);
    const mark = screen.getByRole("button", { name: "Practice mark at 0:30" });
    fireEvent.click(mark, { shiftKey: true });
    expect(screen.queryByRole("button", { name: "Practice mark at 0:30" })).toBeNull();
  });

  it("closing zoom reverts playback to the main loop but keeps the marks", async () => {
    const { video, track } = await mountZoomed();
    addMarkAt(track, 30);
    fireEvent.click(screen.getByRole("button", { name: "Practice mark at 0:30" }));

    act(() => {
      fireEvent.click(screen.getByLabelText("Hide loop zoom timeline"));
    });
    act(() => {
      fireEvent.keyDown(document, { key: "a" });
      fireEvent.keyUp(document, { key: "a" });
    });
    expect(video.currentTime).toBe(0); // mark inert while zoom is off

    act(() => {
      fireEvent.click(screen.getByLabelText("Show loop zoom timeline"));
    });
    const mark = screen.getByRole("button", { name: "Practice mark at 0:30" });
    expect(mark.getAttribute("aria-pressed")).toBe("true"); // active resumed
  });

  it("navigation clears marks", async () => {
    const { track } = await mountZoomed();
    addMarkAt(track, 30);
    await navigateTo("vid2");
    act(() => {
      fireEvent.click(screen.getByLabelText("Show loop zoom timeline"));
    });
    expect(screen.queryByRole("button", { name: /Practice mark/ })).toBeNull();
  });

  it("saving a loop stores the marks; applying a saved loop restores them", async () => {
    const entry = {
      loops: [
        { id: "l1", name: "A", main: { start: 5, end: 60 }, zoom: null, marks: [12, 20] }
      ],
      lastUsedId: "l1",
      addedAt: 10
    };
    await mountWatch("vid1", { [keyFor("vid1")]: entry });
    act(() => enableLoop());
    await flushAsync();

    // Apply the saved loop through the modal.
    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });
    fireEvent.click(screen.getByText("A"));
    await flushAsync();

    act(() => {
      fireEvent.click(screen.getByLabelText("Show loop zoom timeline"));
    });
    expect(screen.getByRole("button", { name: "Practice mark at 0:12" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice mark at 0:20" })).toBeInTheDocument();
  });
});
```

(If a selector in this suite doesn't match the real modal DOM — e.g. the saved-loop row text — mirror how the existing `pencil edit` describe block at pageUi.test.tsx:1225 queries those rows rather than changing the component.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx`
Expected: new suite FAILS (no markers rendered — props not wired); existing suites PASS.

- [ ] **Step 3: Implement the wiring**

In `entrypoints/content/pageUi.tsx`:

Imports:

```ts
import { addMark, removeMark, resolveSegment, marksEqual } from "../../features/playback/marks";
```

State — after the `zoomLoop` declaration (~line 161):

```ts
  // Deep-study practice marks: absolute times shown on the zoom strip.
  // `activeMark` temporarily moves the loop start while zoomed; null means
  // the whole loop plays. Marks persist with saved loops; which one is
  // active is session-only.
  let marks: number[] = [];
  let activeMark: number | null = null;
```

Replace `effectiveSegment` (line ~196):

```ts
  // The loop playback actually obeys: the zoom sub-region while magnified
  // (with an active practice mark as a temporary start when one is set),
  // otherwise the main loop. The mark applies only while zoom is open — that
  // is where marks are visible and where the active one can be clicked off.
  const effectiveSegment = (): LoopSegment | null =>
    zoomed && zoomLoop != null
      ? resolveSegment(zoomLoop, activeMark)
      : state.loopSegment;
```

Mark callbacks — after `onZoomLoopChange` (~line 301):

```ts
  const onAddMark = (time: number) => {
    marks = addMark(marks, time);
    render();
  };

  const onToggleMark = (time: number) => {
    activeMark = activeMark === time ? null : time;
    render();
  };

  const onRemoveMark = (time: number) => {
    marks = removeMark(marks, time);
    if (activeMark === time) activeMark = null;
    render();
  };
```

`seedDefaultLoop` (~line 381) — add beside `zoomLoop = null`:

```ts
    marks = [];
    activeMark = null;
```

`applySavedEntry` (~line 402) and `applyLoop` (~line 512) — add after the `zoomLoop = ...` assignment in each:

```ts
    marks = loop.marks ?? [];
    activeMark = null;
```

`saveAsNew` (~line 494) — replace the Task 2 placeholder `undefined` with the live marks (empty array saves as no marks):

```ts
    const loop = await addLoop(
      videoId,
      name,
      state.loopSegment,
      zoomLoop,
      countInSettings,
      marks.length > 0 ? marks : undefined
    );
```

`onNavigate` (~line 864) — add beside `zoomLoop = null`:

```ts
    marks = [];
    activeMark = null;
```

`isLoopDirty` (line ~101) — add a `marks` parameter and compare:

```ts
function isLoopDirty(
  source: SavedLoop | undefined,
  segment: LoopSegment | null,
  zoom: LoopSegment | null,
  countIn: CountInSettings,
  marks: number[]
): boolean {
  if (segment == null) return false;
  if (source == null) return true;
  if (!segmentsEqual(source.main, segment) || !segmentsEqual(source.zoom, zoom)) {
    return true;
  }
  if (!marksEqual(source.marks, marks)) return true;
  return source.countIn != null && !countInEqual(source.countIn, countIn);
}
```

…and its callsite in `render()` (~line 609):

```ts
    const loopDirty = isLoopDirty(
      selectedLoop,
      state.loopSegment,
      zoomLoop,
      countInSettings,
      marks
    );
```

`buildEditStorePatch` (line ~120) — add a `marks` parameter, include on replace:

```ts
function buildEditStorePatch(
  patch: { name?: string; replaceState?: boolean },
  loopSegment: LoopSegment | null,
  zoom: LoopSegment | null,
  countIn: CountInSettings,
  marks: number[]
): Partial<Pick<SavedLoop, "name" | "main" | "zoom" | "countIn" | "marks">> {
  const store: Partial<Pick<SavedLoop, "name" | "main" | "zoom" | "countIn" | "marks">> = {};
  if (patch.name != null) store.name = patch.name;
  if (patch.replaceState) {
    store.main = loopSegment!;
    store.zoom = zoom;
    store.countIn = countIn;
    store.marks = marks;
  }
  return store;
}
```

…and its callsite in `editSavedLoop` (~line 551):

```ts
    const storePatch = buildEditStorePatch(patch, state.loopSegment, zoomLoop, countInSettings, marks);
```

`render()` — pass the props to `ZoomTimeline` (~line 632):

```tsx
          <ZoomTimeline
            video={video}
            window={state.loopSegment!}
            loop={zoomLoop!}
            marks={marks}
            activeMark={activeMark}
            onAddMark={onAddMark}
            onToggleMark={onToggleMark}
            onRemoveMark={onRemoveMark}
            onLoopChange={onZoomLoopChange}
```

(The remaining props — `onWindowMove`, `closing`, `countIn` — stay exactly as they are today; only the five mark props are inserted.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run entrypoints/content/pageUi.test.tsx && pnpm typecheck`
Expected: PASS (new suite and all pre-existing), no type errors.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/pageUi.tsx entrypoints/content/pageUi.test.tsx
git commit -m "feat(deep-study): wire practice marks into playback, save/apply, and navigation"
```

---

### Task 5: Help modal entry

**Files:**
- Modify: `features/player-overlay/HelpModal.tsx` (SHORTCUTS array, ~line 197)
- Test: `features/player-overlay/HelpModal.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: one new shortcut row; no API changes.

- [ ] **Step 1: Write the failing test**

Add to `features/player-overlay/HelpModal.test.tsx`, alongside the existing card-content assertion (see the `"Move window"` expectation at ~line 100):

```ts
  it("documents the practice marks gesture", () => {
    // Uses the same open-modal setup as the surrounding tests.
    expect(card!.textContent).toContain("Practice marks");
    expect(card!.textContent).toContain("Shift-click the zoom strip");
  });
```

(Match the surrounding test structure — if `card` is produced per-test by a helper, call the same helper.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run features/player-overlay/HelpModal.test.tsx`
Expected: new test FAILS (text not found); others PASS.

- [ ] **Step 3: Add the row**

In `features/player-overlay/HelpModal.tsx`, append to `SHORTCUTS` (after the `⇧ drag` entry):

```ts
  {
    keys: "⇧ click",
    name: "Practice marks",
    desc: "Shift-click the zoom strip to drop a mark. Click a mark to practice from there — the loop plays mark to end. Click it again for the whole loop; Shift-click a mark to remove it.",
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run features/player-overlay/HelpModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/player-overlay/HelpModal.tsx features/player-overlay/HelpModal.test.tsx
git commit -m "docs(help): document the practice-marks gesture"
```

---

### Task 6: Full verification

**Files:** none created — verification only.

- [ ] **Step 1: Full test suite + types**

Run: `pnpm test && pnpm typecheck`
Expected: all suites PASS, no type errors.

- [ ] **Step 2: Live verification in the browser**

Build/dev-load the extension (`pnpm dev`, or reload the extension per the repo's dev-reload notes — a plain tab reload is not always enough after content-script changes; hard-reload the watch page). On a YouTube watch page:

1. Enable the loop, set a range, open zoom.
2. Shift-click the zoom strip → an ivory diamond-tick mark appears at the click point.
3. Click the mark → it lights teal, a brightened stripe runs mark → loop end.
4. Press `A` → playback restarts from the mark; let it play past the loop end → it wraps to the mark (not the loop start).
5. With count-in enabled, press `A` → the count beacon sits on the mark.
6. Click the mark again → stripe gone; `A` restarts from the loop start.
7. Drag the loop start cursor past the mark → mark dims (inert); drag back → live again.
8. Shift-click the mark → removed.
9. Place marks, save a loop, reload the page, apply the loop → marks return.
10. Close zoom with a mark active → playback obeys the main loop; reopen zoom → mark still active.

Report any deviation before proceeding.

- [ ] **Step 3: Final commit (if verification produced fixes)**

```bash
git add -A && git commit -m "fix(deep-study): post-verification fixes"
```

Only if fixes were needed; otherwise nothing to commit.
