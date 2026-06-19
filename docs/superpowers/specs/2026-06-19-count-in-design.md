# Count-in — design

**Status:** approved (brainstorm), ready for implementation plan
**Date:** 2026-06-19

## Summary

A **count-in** plays a synthesized metronome count-off before the loop restarts,
so the player is ready to come in on the downbeat — like a conductor's "1, 2,
3, 4" or a race start. The video pauses at the loop end, the count plays over
silence, and playback resumes at the loop start exactly on the next downbeat.

The count is configurable: **tempo** (tap or drag), **time signature**, and
**number of bars** (1–4). It is synthesized with the Web Audio API — our own
sound, layered on top of the page; we never touch YouTube's audio.

This is the first of a planned set of deliberate-practice features (speed
trainer, rep counter, loop notes were also considered — see the practice-ideas
discussion). Count-in shipped first by user choice.

## Goals

- Give a musical lead-in so the player enters the passage in time, not cold.
- Configurable to the music: meter, tempo, count length.
- Feel native to Étude: reuse the panel pill, the speed-control scrub idiom, the
  teal aesthetic.
- Robust: never leave the player stuck paused; degrade cleanly when audio is
  blocked or the user interrupts.

## Non-goals (v1)

- **No automatic tempo detection** — tap or set it manually.
- **No real-track lead-in** — the count is over silence (the "race start"
  model), not the song's own audio played early.
- **No compound-meter feel** — the time-signature denominator (e.g. the 8 in
  6/8) is display-only; clicks fire once per numerator beat. True compound
  grouping is a later polish.
- **No speed-linking** — the count plays at the set BPM regardless of the
  video's playback rate. (Future: optionally scale the count by `playbackRate`.)
- **No count before the first rep** — the count fires on loop *wraps* (end →
  start), not on the initial manual play. (Future option.)
- **One-shot mode**: out of scope for v1; count-in applies in loop mode. The
  design leaves room to add it.

## Behavior

### The count-off pattern

A count is **N bars** (1–4) in a chosen **time signature**. Beats are clicks
synthesized as short sine tones.

- **Earlier bars** (only present when bars > 1): a plain metronome. Beat 1 of
  each bar is an **accent** (higher, slightly louder); the rest are plain
  **clicks**.
- **The final bar** carries the entrance cue:
  - all beats except the last two are **staccato** clicks,
  - the **second-to-last beat is sustained** — held at full volume for its
    entire beat, then cut clean,
  - the **last beat is a rest** (silence — a breath),
  - the **next downbeat is the loop start** ("GO").

Worked example, 4/4 × 1 bar: `staccato · staccato · sustained ── · (rest)` →
loop start. This is the pattern the user validated by ear.

Edge: for a 2-beat meter the final bar is `sustained · rest`; for a 1-beat
degenerate case it is just the rest (no real meter — not offered in the UI).

### The loop cycle with count-in on

1. Loop body plays `start → end` as normal.
2. On reaching `end` (the loop wrap), if count-in is enabled:
   - the playhead is seeked back to `start` (as it already is on a normal wrap),
   - the video is **paused** on the loop-start frame,
   - the count-off plays over silence, beats lighting in the UI,
   - on the final downbeat the video **resumes playing** from `start`.
3. Repeat on every subsequent wrap.

With count-in off, the loop wraps exactly as it does today.

### Tempo, meter, bars

- **Tempo (BPM):** two ways to set it, mirroring nothing new conceptually:
  - **Tap tempo** — tap a pad in time; BPM = `60000 / average tap interval`
    over the taps in the last ~3 s (needs ≥ 2 taps). Clamped to 40–220.
  - **Drag to fine-tune** — drag the BPM readout up/down against a vertical tick
    tape, reusing the speed-control scrub engine (`speedScrub` utilities,
    pointer-lock idiom). 1-BPM steps.
- **Time signature:** chosen from 2/4, 3/4, 4/4, 6/8 (numerator drives beat
  count; denominator is display-only in v1). Default **4/4**.
- **Bars:** 1–4. Default **1**.

## Architecture

The work splits into small, independently testable units.

### `features/playback/countOff.ts` (pure)

The musical model, no I/O.

```ts
type Meter = { beatsPerBar: number; noteValue: number };
type CountOffConfig = { meter: Meter; bars: number; bpm: number };
type BeatRole = "accent" | "click" | "staccato" | "sustain" | "rest";
type ScheduledBeat = {
  index: number;       // 0-based beat across the whole count
  timeSec: number;     // offset from count start
  role: BeatRole;
  freqHz: number;      // 0 for rest
  durSec: number;      // 0 for rest
};
type CountOffPlan = { beats: ScheduledBeat[]; totalSec: number };

function buildCountOff(config: CountOffConfig): CountOffPlan;
function roleAt(bar: number, beat: number, config): BeatRole;
```

`totalSec = bars * beatsPerBar * (60 / bpm)`; the loop resumes at `totalSec`.
Fully unit-testable: beat times, roles per meter/bars, total duration, edge
meters.

### `features/player-overlay/countInAudio.ts`

Web Audio playback of a `CountOffPlan`.

- Owns a lazily-created, reused `AudioContext` singleton, unlocked on the first
  panel user gesture (toggling the loop or count-in). `resume()` before each run
  to cover suspension.
- `play(plan, { onBeat })`: schedules each non-rest beat as an
  `OscillatorNode` + `GainNode` at `ctx.currentTime + beat.timeSec` (sample-
  accurate). Sustain = flat gain held for the beat then an ~18 ms release;
  staccato/click = short exponential decay. Calls `onBeat(index)` (via timers)
  for visual sync. Returns a `cancel()` that stops scheduled nodes and clears
  timers.
- If the context cannot start (audio blocked, no prior gesture), `play` reports
  unavailable so the caller can skip the silent pause and just loop normally.

### Count-in orchestration (in `pageUi.tsx`, possibly extracted to a controller)

Wires the count into the existing enforcement loop.

- `enforceSegmentEnd` gains a `wrapped: boolean` on its result — **true only on
  the loop-mode `end → start` wrap**, false for the front-edge snap (both still
  set `sought`). This lets the caller distinguish a real wrap from a snap.
- In `pageUi`'s `enforce()`: when `result.wrapped` and count-in is enabled and a
  count is not already running, trigger the count:
  - pause the video (the wrap seek already put the playhead at `start`),
  - `countInAudio.play(plan, { onBeat })`,
  - on completion, `video.play()`.
- The trigger is idempotent (guarded by a "counting" flag) so the rAF tick
  cannot start a second count.
- **Cancel** the count and resume normal playback on any of: user scrubs
  (zoom-track or native), loop segment change, SPA navigation, loop toggled off,
  count-in toggled off, or the user pressing play during the count. Cancelling
  always leaves the video playing (never stuck paused).

Keeping `enforceSegmentEnd` pure (only the new `wrapped` flag) avoids coupling
count-in state into `PlaybackState`; the branch lives in the orchestrator.

### `features/persistence/countInStore.ts`

- **Global on/off:** `you-loop:count-in` (boolean) in `storage.local`, mirroring
  `getLoopOn`/`setLoopOn`. Off by default.
- **Per-video settings:** key `you-loop:countin:v:<videoId>` →
  `{ bpm, beatsPerBar, noteValue, bars }` in `storage.local`. Defaults when
  absent: `bpm 100, 4/4, bars 1`. Per-video because tempo and meter are
  song-specific. `storage.local` (not sync) in v1 — small, cheap to re-tap;
  syncing it is an easy follow-up.

### `features/player-overlay/CountInControl.tsx`

The UI, living in the `LoopPanel` pill next to the zoom button.

- A **metronome toggle button** in the pill; lit (teal) when count-in is on,
  disabled when the loop is off.
- A **popover** portalled to the player element (the same pattern as
  `SpeedControl`, since the pill clips overflow), containing:
  - an **on/off switch**,
  - a **tap pad** ("tap here in time"),
  - a **BPM readout** that drag-scrubs up/down (speed-control scrub engine),
  - **time-signature** and **bars** selectors.
- The exact split between *click-toggles-on/off* and *opens-popover* on the pill
  button is finalized in implementation (candidates: click toggles + caret
  opens; or click opens, switch toggles).

### Visual feedback during the count

Beats light in sequence (the "beat-riser" treatment the user preferred) while
the video sits paused on the loop-start frame. The exact anchor (at the loop
start cursor vs a compact overlay near the panel) is finalized in
implementation; v1 must at minimum pulse the count visibly in time. A
center-screen count display is possible future polish.

## Edge cases

- **Loop starts at 0:00** — count plays over silence, then plays from 0. No
  special handling (the old "no room for lead-in" problem only existed for the
  real-track model, which was dropped).
- **Loop shorter than the count** — allowed; the count plays each wrap. User's
  choice.
- **Audio blocked / no gesture yet** — count degrades to a normal loop (no
  silent pause), so the user never gets a confusing dead gap.
- **Background-tab throttling** — `setTimeout`-driven visuals/resume may drift;
  acceptable, count-in is a foreground feature. Audio scheduling uses
  `AudioContext` time and stays accurate.
- **Interrupted count** (scrub, nav, toggle, manual play, loop change) — cancel,
  leave the video playing.
- **Playback rate ≠ 1×** — count plays at the set BPM regardless (v1).

## Testing

- `countOff.ts`: pure unit tests — beat times, roles per meter and bar count,
  total duration, the 2-beat edge meter.
- Tap-tempo averaging: pure function, unit tested (intervals → BPM, clamp,
  < 2 taps no-op).
- `enforceSegmentEnd`: extend existing tests for the new `wrapped` flag (true on
  wrap, false on front snap, false when not looping).
- `countInStore`: get/set/default and per-video keying.
- Orchestration/audio: test the plan + cancellation logic with an injected clock
  and a mock `AudioContext`; the timer-driven resume guarded by the counting
  flag.

## Open items deferred to later

- Sync per-video count settings across devices.
- Count before the first rep (option).
- Speed-linked count tempo (option).
- One-shot mode count-in.
- Compound-meter feel for 6/8 etc.
- Count-in volume control; sound character tweaks (square vs sine, accent).
- Tap-tempo keyboard binding.
