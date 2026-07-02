# Loop Practice State + Modal Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saved loops capture count-in settings, can be updated in place with a delta preview, and the saved-loops modal drops its second tab and gets a density pass (loop-map, tempo badge, hover-reveal delete).

**Architecture:** `countIn` becomes an optional field on `SavedLoop` (sync storage, no migration). pageUi snapshots the per-video settings into saves, restores + writes through on apply, and extends dirty detection. The modal loses the tab/pane machinery and gains an update block and richer rows. Sanitization funnels through one exported guard in `countInStore`.

**Tech Stack:** WXT extension, React 18, vitest + @testing-library/react (jsdom), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-02-loop-practice-state-design.md`

## Global Constraints

- Existing stored data must load unchanged (optional field, sanitize on read, no migration).
- `pnpm typecheck` and `npx vitest run` green after every task.
- Injected page CSS lives in `entrypoints/content/pageUi.styles.ts` (kebab `.you-loop-lm-*` classes).
- Tests follow the harnesses already in `entrypoints/content/pageUi.test.tsx` (`mountWatch`, `flushAsync`, `SAVED_ENTRY`) and `features/persistence/*.test.ts` (`makeArea`/`memArea`).
- Commit after each task, Conventional Commits style.

---

### Task 1: Export `sanitizeCountInSettings` from countInStore

**Files:**
- Modify: `features/persistence/countInStore.ts`
- Test: `features/persistence/countInStore.test.ts`

**Interfaces:**
- Produces: `export function sanitizeCountInSettings(raw: unknown): CountInSettings` — clamps finite numbers into range (bpm [40,400] via MIN_BPM/MAX_BPM, beatsPerBar [1,12], noteValue [1,16], bars [1,4]), falls back to `DEFAULT_COUNT_IN_SETTINGS` fields otherwise; non-object input returns defaults.

- [ ] **Step 1: Failing test** — in the per-video settings describe block:

```ts
it("sanitizeCountInSettings guards arbitrary input", () => {
  expect(sanitizeCountInSettings(null)).toEqual(DEFAULT_COUNT_IN_SETTINGS);
  expect(sanitizeCountInSettings({ bpm: 0, beatsPerBar: 99 })).toEqual({
    ...DEFAULT_COUNT_IN_SETTINGS,
    bpm: 40,
    beatsPerBar: 12
  });
});
```

- [ ] **Step 2: Run** `npx vitest run features/persistence/countInStore.test.ts` — FAIL (not exported).
- [ ] **Step 3: Implement** — extract the existing body of `loadCountInSettings`'s sanitize block:

```ts
export function sanitizeCountInSettings(raw: unknown): CountInSettings {
  const d = DEFAULT_COUNT_IN_SETTINGS;
  if (raw == null || typeof raw !== "object") return d;
  const merged = { ...d, ...(raw as Partial<CountInSettings>) };
  return {
    bpm: intInRange(merged.bpm, MIN_BPM, MAX_BPM, d.bpm),
    beatsPerBar: intInRange(merged.beatsPerBar, 1, 12, d.beatsPerBar),
    noteValue: intInRange(merged.noteValue, 1, 16, d.noteValue),
    bars: intInRange(merged.bars, 1, 4, d.bars)
  };
}
```

`loadCountInSettings` now returns `sanitizeCountInSettings(r[key])` inside its try.

- [ ] **Step 4: Run** the file's tests — PASS (existing clamp tests keep passing).
- [ ] **Step 5: Commit** `refactor(count-in): export sanitizeCountInSettings guard`

### Task 2: `SavedLoop.countIn` + `updateLoop` in loopStore

**Files:**
- Modify: `features/persistence/loopStore.ts`
- Test: `features/persistence/loopStore.test.ts`

**Interfaces:**
- Consumes: `sanitizeCountInSettings`, `CountInSettings` from `./countInStore`.
- Produces:
  - `SavedLoop` gains `countIn?: CountInSettings | null`.
  - `addLoop(videoId, name, main, zoom, countIn?: CountInSettings | null)` stores the snapshot.
  - `export async function updateLoop(videoId: string, loopId: string, patch: { main: LoopSegment; zoom: LoopSegment | null; countIn: CountInSettings | null }, area?): Promise<SavedLoop | null>` — overwrites the loop in place, returns the updated loop, `null` (no write) when the id is gone.
  - Reads sanitize `loop.countIn` when present (in `readEntry` or the entry-mapping path): `countIn == null ? countIn : sanitizeCountInSettings(countIn)`.

- [ ] **Step 1: Failing tests**

```ts
it("addLoop stores a count-in snapshot and loadEntry returns it sanitized", async () => {
  const area = makeArea();
  const snap = { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 };
  const loop = await addLoop("v1", "solo", { start: 1, end: 2 }, null, snap, area);
  expect(loop.countIn).toEqual(snap);
  // Corrupt it in place, then read back: sanitized.
  const key = keyFor("v1");
  const dump = area.dump();
  (dump[key] as any).loops[0].countIn = { bpm: NaN };
  expect((await loadEntry("v1", area))!.loops[0].countIn).toEqual(
    DEFAULT_COUNT_IN_SETTINGS
  );
});

it("updateLoop overwrites main/zoom/countIn in place", async () => {
  const area = makeArea();
  const loop = await addLoop("v1", "riff", { start: 1, end: 2 }, null, null, area);
  const updated = await updateLoop("v1", loop.id, {
    main: { start: 3, end: 5 },
    zoom: { start: 3.5, end: 4 },
    countIn: { bpm: 90, beatsPerBar: 3, noteValue: 4, bars: 2 }
  }, area);
  expect(updated?.main).toEqual({ start: 3, end: 5 });
  const entry = await loadEntry("v1", area);
  expect(entry!.loops[0].countIn?.bpm).toBe(90);
  expect(entry!.loops[0].name).toBe("riff"); // name untouched
});

it("updateLoop on a vanished id is a null no-op", async () => {
  const area = makeArea();
  await addLoop("v1", "riff", { start: 1, end: 2 }, null, null, area);
  expect(await updateLoop("v1", "nope", { main: { start: 0, end: 1 }, zoom: null, countIn: null }, area)).toBeNull();
});
```

(Adjust `addLoop`/`loadEntry` signatures to the file's actual storage-param order when writing.)

- [ ] **Step 2: Run** — FAIL (no countIn param / updateLoop undefined).
- [ ] **Step 3: Implement** — extend type, thread `countIn` through `addLoop`'s stored object, sanitize on read where entries are parsed, add `updateLoop` mirroring `removeLoop`'s read-modify-write shape.
- [ ] **Step 4: Run** loopStore tests — PASS; run migrate/settings tests too (shared file shapes).
- [ ] **Step 5: Commit** `feat(loops): per-loop count-in snapshot + updateLoop`

### Task 3: pageUi wiring — snapshot on save, restore on apply, countIn-aware dirty

**Files:**
- Modify: `entrypoints/content/pageUi.tsx` (saveAsNew, applyLoop, isLoopDirty, new updateSelectedLoop)
- Test: `entrypoints/content/pageUi.test.tsx`

**Interfaces:**
- Consumes: Task 2's `addLoop` 5th param, `updateLoop`.
- Produces (consumed by Tasks 4–5's modal props):
  - `isLoopDirty(source, segment, zoom, countIn)` — adds: dirty when `source.countIn != null` and differs field-wise from current settings.
  - `updateSelectedLoop(): Promise<void>` — calls `updateLoop(videoId, selectedLoopId, { main: state.loopSegment, zoom: zoomLoop, countIn: countInSettings })`, replaces the loop in `savedLoops`, re-renders.
  - `applyLoop` additionally: `if (loop.countIn != null) { countInSettings = sanitizeCountInSettings(loop.countIn); void saveCountInSettings(videoId, countInSettings); }`
  - `saveAsNew` passes `countInSettings` snapshot to `addLoop`.
  - render passes `sourceLoop` (the `savedLoops` entry for `selectedLoopId`, undropped by drift) to the modal.

- [ ] **Step 1: Failing tests** (pageUi.test.tsx, using `mountWatch` + `SAVED_ENTRY` variants):

```ts
it("applying a loop with a count-in snapshot restores and persists it", async () => {
  const entry = { ...SAVED_ENTRY, loops: [{ ...SAVED_ENTRY.loops[0], countIn: { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 } }] };
  const { dump } = await mountWatch("vid1", { [keyFor("vid1")]: entry, [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() } });
  await flushAsync();
  // Launch applied the loop: the per-video store now carries the snapshot.
  expect((dump()[countInKeyFor("vid1")] as any)?.bpm).toBe(140);
});

it("applying a legacy loop leaves count-in settings untouched", async () => {
  const { dump } = await mountWatch("vid1", { [keyFor("vid1")]: SAVED_ENTRY, [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() } });
  await flushAsync();
  expect(dump()[countInKeyFor("vid1")]).toBeUndefined();
});

it("saving a loop snapshots the current count-in settings", async () => {
  const { dump } = await mountWatch("vid1", { [countInKeyFor("vid1")]: { bpm: 90, beatsPerBar: 3, noteValue: 4, bars: 2 } });
  await flushAsync();
  act(() => { enableLoop(); });
  act(() => { fireEvent.click(screen.getByLabelText("Saved loops")); });
  fireEvent.change(screen.getByPlaceholderText("Name this loop"), { target: { value: "riff" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  const entry = dump()[keyFor("vid1")] as any;
  expect(entry.loops[0].countIn).toEqual({ bpm: 90, beatsPerBar: 3, noteValue: 4, bars: 2 });
});
```

(Check the loops-toggle aria-label in `LoopPanel.tsx` before writing; adjust selector.)

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per Interfaces above.
- [ ] **Step 4: Run** pageUi tests — PASS.
- [ ] **Step 5: Commit** `feat(loops): snapshot count-in on save, restore on apply`

### Task 4: Modal — drop the Saved videos tab

**Files:**
- Modify: `features/player-overlay/SavedLoopsModal.tsx` (delete Tab type, tab/pendingTab state, switchTab, both tab effects, FLIP height effect, `<nav>` and pane wrappers, `savedVideos`/`currentVideoId`/`onOpenVideo` props, `VideoList` import)
- Modify: `entrypoints/content/pageUi.tsx` (drop `savedVideos` state, `refreshLibrary`, `openVideo`, related props; keep `listEntries` import only if still used — it isn't: remove)
- Modify: `entrypoints/content/pageUi.styles.ts` (delete `.you-loop-lm-tabs`, `.you-loop-lm-tab`, pane animation blocks)
- Test: `entrypoints/content/pageUi.test.tsx`, `features/player-overlay/SavedLoopsModal.test.tsx` (if present) — delete tab-related tests

**Interfaces:**
- Produces: modal props shrink to `{ open, container, loops, selectedId, currentSegment, dirty, sourceLoop, duration, onClose, onSaveAsNew, onUpdateLoop, onApply, onDelete }` (sourceLoop/duration/onUpdateLoop may land as no-ops until Tasks 5–6; add them here so the type settles once).

- [ ] **Step 1:** Grep for tab-related test assertions: `grep -n "Saved videos\|library\|tab" entrypoints/content/pageUi.test.tsx features/player-overlay/*.test.tsx` — delete/adjust those tests first, run to see them removed from the count.
- [ ] **Step 2:** Strip the component + pageUi + styles per Files above.
- [ ] **Step 3:** Run full suite + typecheck — PASS.
- [ ] **Step 4: Commit** `refactor(loops): single-pane saved-loops modal, popup owns the library`

### Task 5: Modal — update-in-place block with delta preview

**Files:**
- Modify: `features/player-overlay/SavedLoopsModal.tsx`
- Modify: `entrypoints/content/pageUi.tsx` (pass `sourceLoop`, `onUpdateLoop={updateSelectedLoop}`)
- Modify: `entrypoints/content/pageUi.styles.ts`
- Test: `entrypoints/content/pageUi.test.tsx`

**Interfaces:**
- Consumes: `sourceLoop: SavedLoop | undefined`, `dirty`, `onUpdateLoop(): void`, Task 3's `updateSelectedLoop`.
- Produces: update block markup:

```tsx
{sourceLoop != null && dirty && (
  <button type="button" className="you-loop-lm-update" onClick={(e) => { swallow(e); onUpdateLoop(); }}>
    <span className="you-loop-lm-update-title">↻ Update “{sourceLoop.name}”</span>
    <span className="you-loop-lm-update-delta">{describeDelta(sourceLoop, currentSegment, currentZoom, currentCountIn)}</span>
  </button>
)}
```

with `describeDelta` a pure helper in the modal file returning only changed fields, e.g. `0:42–1:03 → 0:40–1:03 · ♩140 → 145`; meter change renders `4/4 → 6/8`, bars `1 bar → 2 bars`. Requires passing `currentZoom: LoopSegment | null` and `currentCountIn: CountInSettings` props from pageUi.

- [ ] **Step 1: Failing tests:**

```ts
it("offers update-in-place when the applied loop has drifted", async () => { /* apply SAVED_ENTRY loop via launch, drag a handle to drift, open modal, expect button /Update “A”/ with delta text “0:05 – 0:09 → 0:20 – 0:09” style content */ });
it("update commits the current state into the loop", async () => { /* click update, flush, dump() shows loops[0].main.start === 20 and modal button gone (selection clean) */ });
it("no update block without a source loop", async () => { /* fresh video, dirty selection, open modal, queryByText(/Update/) null */ });
```

Write these fully at implementation time using the Task 3 fixtures — the drag helper (`timeline.getBoundingClientRect` stub + pointer events on "Loop start") is the established pattern in this file.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** block + `describeDelta` + `.you-loop-lm-update*` styles (teal ghost: transparent bg, 1px `rgba(94,234,212,0.5)` border, radius 8px, hover fills `rgba(94,234,212,0.08)`; delta line 11.5px `rgba(255,255,255,0.55)` tabular-nums) + "─ or ─" divider styled like `.you-loop-lm-label`.
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(loops): update a saved loop in place with delta preview`

### Task 6: List polish — loop-map, tempo badge, hover-reveal delete

**Files:**
- Modify: `features/player-overlay/SavedLoopsModal.tsx` (rows), `entrypoints/content/pageUi.tsx` (pass `duration={getVideoDuration(video)}`), `entrypoints/content/pageUi.styles.ts`
- Test: `entrypoints/content/pageUi.test.tsx`

**Interfaces:**
- Consumes: `duration: number` prop; `loop.countIn` from Task 2.
- Produces: row structure:

```tsx
<li className="you-loop-lm-row" data-selected={...}>
  <button className="you-loop-lm-apply" ...>
    <span className="you-loop-lm-name-text">{loop.name}</span>
    {loop.countIn != null && (
      <span className="you-loop-lm-tempo">{`♩${loop.countIn.bpm} · ${loop.countIn.beatsPerBar}/${loop.countIn.noteValue}`}</span>
    )}
    <span className="you-loop-lm-range">{formatRange(loop.main)}</span>
  </button>
  <span className="you-loop-lm-actions">…</span>
  <span className="you-loop-lm-map" aria-hidden="true">
    <span className="you-loop-lm-map-band" style={{ left: `${(loop.main.start / duration) * 100}%`, width: `${((loop.main.end - loop.main.start) / duration) * 100}%` }} />
  </span>
</li>
```

- [ ] **Step 1: Failing test:**

```ts
it("rows show a tempo badge and a loop-map band", async () => {
  const entry = { ...SAVED_ENTRY, loops: [{ ...SAVED_ENTRY.loops[0], countIn: { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 } }] };
  await mountWatch("vid1", { [keyFor("vid1")]: entry });
  await flushAsync();
  act(() => { enableLoop(); });
  act(() => { fireEvent.click(screen.getByLabelText("Saved loops")); });
  expect(screen.getByText("♩140 · 4/4")).toBeInTheDocument();
  const band = document.querySelector(".you-loop-lm-map-band") as HTMLElement;
  // SAVED_ENTRY loop 5–9 on a 120s video.
  expect(band.style.left).toBe("4.166666666666666%");
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** markup + CSS: `.you-loop-lm-map` absolute 2px hairline at row bottom (inset 6px sides), `rgba(255,255,255,0.12)`; band `#14b8a6`, selected row band `#5eead4`; `.you-loop-lm-tempo` 11px `rgba(94,234,212,0.8)` tabular-nums nowrap; `.you-loop-lm-actions button { opacity: 0 }` with `.you-loop-lm-row:hover button, .you-loop-lm-row:focus-within button { opacity: 1 }` (keep red hover); row gets `position: relative`.
- [ ] **Step 4: Run** suite + typecheck — PASS.
- [ ] **Step 5: Commit** `feat(loops): loop-map, tempo badge, hover-reveal delete in saved list`

### Task 7: Build + hand-verify

- [ ] `pnpm build` — output lands in `.output/chrome-mv3` (Chrome unpacked reads it on tab reload; CSS changes need hard reload).
- [ ] Hand-check on YouTube: save → badge appears; tweak bpm → row deselects + update block with `♩` delta; update → row re-selects; legacy loop applies without touching tempo; no Saved-videos tab; popup library still works.
