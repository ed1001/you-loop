# Pitch Shift — Design

**Date:** 2026-06-26
**Status:** Approved for planning
**Author:** Edward Phillips (with Claude)

## Summary

Add an independent **pitch shift** control to the you-loop YouTube practice looper: change the pitch of the playing audio **without changing playback speed**. A musician can transpose a song to a singable key or to match an instrument's tuning while the tempo (and the existing speed control) stay exactly as they are.

This is true pitch shifting via Web Audio DSP — *not* varispeed (`preservesPitch = false`), which ties pitch to speed. Pitch and speed are orthogonal: speed continues to ride YouTube's `playbackRate`; pitch is applied by a Web Audio node inserted into the video's audio graph.

Feasibility is already proven by a browser spike: `createMediaElementSource` on YouTube's `<video>` yields non-silent audio (YouTube uses same-origin MSE, so the graph is not CORS-tainted), and a granular shifter audibly raised pitch with tempo unchanged. The spike's cheap granular DSP had amplitude-pumping artifacts; the real build replaces the engine (see Engine below).

## Goals

- Shift pitch in **whole semitones** over **±12** (one octave each way), the primary musical interaction.
- Provide a **fine ±50 cents** trim for matching recordings that are slightly sharp or flat.
- Keep pitch **fully independent of speed**. Changing speed must not move pitch, and vice versa.
- Clean audio quality — no tremolo/pumping from the spike's granular shifter.
- **Per-video persistence**, mirroring count-in: each song remembers its transpose.
- **Never break YouTube audio**: any failure falls back to transparent passthrough.
- UI that matches existing controls (scrub dial + popover), so it feels native to the panel.

## Non-Goals

- Formant correction / "natural voice" preservation (a later enhancement).
- A/V latency compensation (pitch DSP adds tens of ms of audio latency; acceptable for a practice loop without external sync — revisit only if users notice).
- Pitch automation over time, pitch-per-loop-segment, or MIDI-style mapping.
- Changing the existing speed control's behavior.

## Engine Decision

The pitch DSP lives behind a small **`PitchEngine` interface** so the algorithm can be swapped without touching the UI, store, or routing.

| Engine | Quality | Risk | Decision |
|---|---|---|---|
| **SoundTouch core in an AudioWorklet** | Clean WSOLA, no tremolo, native semitone control | Pure JS, MIT, off the main thread → no glitches under load | **Ship this (v1)** |
| Signalsmith Stretch (WASM) | Higher ceiling on dense polyphonic material | WASM-in-worklet + a second CSP unknown to clear; a load failure means broken audio | Fast-follow A/B behind the same interface |
| Tuned granular (spike) | Amplitude pumping is inherent, never fully removed | Lightest | Rejected |

**Rationale:** reliability *is* user experience. SoundTouch (pure JS, MIT, mature — the algorithm Audacity uses) sounds clean and always loads, beating Signalsmith's marginally-higher ceiling that carries a "might not load" risk. The interface keeps Signalsmith as a drop-in upgrade we can A/B later with zero UI churn.

**Worklet vs. ScriptProcessor.** The preferred node is an `AudioWorkletNode` (off-main-thread, no dropouts). The spike proved YouTube's CSP blocks worklet modules loaded from `blob:`/`data:` URLs. **Open question, resolved as the first build step:** does a worklet module loaded from a `chrome.runtime.getURL()` web-accessible-resource URL load on a YouTube page? Expectation: yes — the module is extension-origin, not page-origin, and page CSP governs page-origin fetches. If it loads, we use the AudioWorklet. If it does not, we fall back to a `ScriptProcessorNode` running the same SoundTouch core on the main thread (proven to work in the spike). Either way the feature ships; this only decides the node type.

## Architecture

### Audio graph and the irreversibility constraint

`AudioContext.createMediaElementSource(video)` is **one-shot and irreversible**: it can be called only once per media element, cannot be undone, and once called *all* of that element's audio is routed through the Web Audio graph (it no longer reaches the speakers directly). This drives three rules:

1. **Lazy tap.** We do not call `createMediaElementSource` until pitch is *first engaged* (enabled with a non-zero offset, or the user opens the control and turns it on). Users who never use pitch get zero changes to their audio path and zero risk.

2. **Transparent bypass.** Once tapped, the graph is:

   ```
   video ── MediaElementSource ── inputGain ──┬── pitchNode ── destination   (engaged)
                                              └── (direct)  ── destination   (bypassed)
   ```

   Bypass is implemented by connecting/disconnecting branches, not by running a pass-through DSP. When pitch is at 0 semitones / 0 cents or disabled, we connect `inputGain → destination` directly and disconnect the pitch branch, so the audio is bit-identical to untapped output (no coloration, no added latency). Exactly one branch is connected at a time.

3. **Never break audio.** If the worklet module fails to load, the engine throws, or the context is in a bad state, we connect the direct branch, disconnect the pitch branch, and mark pitch **unavailable** (the UI reflects this). Audio always survives even if pitch does not.

### AudioContext ownership and count-in coexistence

Count-in synthesizes its beeps on its own `AudioContext` and **never taps the video element** (`features/player-overlay/countInAudio.ts`). Pitch owns the video element's audio graph on its **own** `AudioContext`. The two contexts both render to the same output device, which is allowed and conflict-free. Count-in is left entirely untouched — minimal blast radius on a working feature.

### Speed independence

Speed continues to be applied via `video.playbackRate` in `features/playback/controller.ts`. We ensure `video.preservesPitch` stays `true` (its default) so YouTube's own time-stretch keeps pitch constant across speed changes. The user's intentional pitch offset is then applied *on top* by the pitch node. Result: speed and pitch compose cleanly and independently. The input the pitch node receives is already speed-adjusted audio; SoundTouch shifts only its pitch, not its tempo.

## Components

Mirrors the count-in feature's module layout so the codebase stays consistent.

### `features/persistence/pitchStore.ts`
Mirrors `countInStore.ts`. Plain `browser.storage.local` via the shared `StorageArea` type — no state library.

```ts
export const PITCH_ENABLED_KEY = "you-loop:pitch";          // global on/off (boolean)
export const PITCH_KEY_PREFIX  = "you-loop:pitch:v:";       // per-video settings

export type PitchSettings = {
  semitones: number;   // integer, clamped [-12, 12]
  cents: number;       // integer, clamped [-50, 50]
};

export const DEFAULT_PITCH_SETTINGS: PitchSettings = { semitones: 0, cents: 0 };

export function pitchKeyFor(videoId: string): string;
export async function getPitchEnabled(area?): Promise<boolean>;
export async function setPitchEnabled(value, area?): Promise<void>;
export async function loadPitchSettings(videoId, area?): Promise<PitchSettings>;
export async function savePitchSettings(videoId, settings, area?): Promise<void>;
```

Load merges over defaults (`{ ...DEFAULT, ...raw }`); all reads/writes are best-effort with the same try/catch fallback pattern as count-in.

### `features/pitch/pitchScrub.ts` (+ `pitchScrub.test.ts`)
Pure math, mirroring `bpmScrub.ts` / `speedScrub.ts`. No DOM, no audio — fully unit-testable.

- `SEMITONE_RANGE = 12`, `CENTS_RANGE = 50`, `PX_PER_SEMITONE` (drag sensitivity).
- `semitonesFromDrag(start, dyUp)` → snapped, clamped integer semitones.
- `clampSemitones(n)`, `clampCents(n)`.
- `pitchRatio({ semitones, cents })` → `2 ** ((semitones + cents / 100) / 12)`.
- `formatPitch({ semitones, cents })` → label, e.g. `"+3"`, `"−2"`, `"0"`, `"+3 +12¢"`.
- Tape/needle offset helpers for the scrub visual (mirror `bpmScrub` needle helpers).

### `features/pitch/pitchEngine.ts`
The swappable DSP boundary.

```ts
export interface PitchEngine {
  node: AudioNode;                 // connect input here, read output here
  setRatio(ratio: number): void;   // 1 = no shift
  dispose(): void;
}
export async function createPitchEngine(ctx: AudioContext): Promise<PitchEngine>;
```

- Primary: load the SoundTouch worklet module via `chrome.runtime.getURL(...)`, construct an `AudioWorkletNode`, push `setRatio` over its `port`/`AudioParam`.
- Fallback: if `audioWorklet.addModule` rejects, build a `ScriptProcessorNode` running the same SoundTouch core on the main thread.
- `createPitchEngine` rejects only if *both* paths fail; callers treat rejection as "pitch unavailable."

The SoundTouch core (DSP classes) is bundled and fed a live `inputs[0]` → FIFO → filter → `outputs[0]` stream; pitch is set via SoundTouch's pitch parameter from the `ratio`.

### `features/pitch/pitchGraph.ts`
Owns the audio side end-to-end. The only module that knows about `createMediaElementSource`.

```ts
export interface PitchGraph {
  setEnabled(on: boolean): void;        // engage/bypass; lazily taps on first engage
  setSettings(s: PitchSettings): void;  // recompute ratio, auto-bypass when at 0
  isAvailable(): boolean;
  dispose(): void;
}
export function createPitchGraph(video: HTMLVideoElement): PitchGraph;
```

Responsibilities: lazy `createMediaElementSource`, build `inputGain`, obtain a `PitchEngine`, switch the direct/pitch branches, recompute ratio from settings, and on any failure connect the direct branch + report unavailable. When settings resolve to ratio `1` (0 semis, 0 cents) it auto-bypasses even while "enabled," so the off state is always transparent.

### `features/player-overlay/PitchControl.tsx`
Mirrors `CountInControl.tsx`. A scrub pill plus a dismissable popover.

- **Pill:** shows the current offset (e.g. `♯ +3`). Drag up/down to change semitones using the existing pointer-lock pattern (`requestPointerLock`, `movementY` accumulation, `clientY` fallback) shared with the BPM/Speed dials. Click resets to 0.
- **Popover (`▾`):** fine ±50¢ slider, an explicit on/off switch, and a reset. Dismissable via Escape and outside-click, matching `CountInControl`. Rendered through `createPortal` into the loops container like count-in's popover.
- Renders an **"unavailable"** state if `pitchGraph.isAvailable()` is false.

### Worklet asset + manifest
The SoundTouch worklet processor (and the bundled SoundTouch core it needs) is emitted as a web-accessible resource and added to `web_accessible_resources` in `wxt.config.ts` (currently `fonts/*` only). Loaded at runtime via `chrome.runtime.getURL(...)`.

### Wiring — `entrypoints/content/pageUi.tsx` and `features/player-overlay/LoopPanel.tsx`
- Instantiate `createPitchGraph(video)` alongside the count-in player/controller (around `pageUi.tsx:675`).
- On video mount: `loadPitchSettings(videoId)` and `getPitchEnabled()`, then `setSettings` / `setEnabled`.
- On edit: persist via `savePitchSettings` / `setPitchEnabled` (debounced like count-in's saves).
- On `yt-navigate-finish` / teardown: `pitchGraph.dispose()` and reload settings for the new video.
- Render `<PitchControl />` in the pill row in `LoopPanel.tsx` next to `CountInControl` / `SpeedControl`.

## Data Flow

1. Video loads → `pageUi` reads `getPitchEnabled()` + `loadPitchSettings(videoId)`.
2. If disabled or settings resolve to ratio 1 → **no tap**; audio path untouched.
3. User drags the pill / edits the popover → `PitchControl` updates local state → `pitchGraph.setSettings(...)` → on first non-trivial engage, `pitchGraph` taps the element, builds the graph, connects the pitch branch, sets the ratio.
4. Settings persisted per video (debounced).
5. Speed changes flow through `playbackRate` independently; pitch ratio is unaffected.
6. Returning to a song later → settings restored → graph re-engaged.

## Error Handling

- **Worklet load fails / engine throws:** connect direct branch, disconnect pitch branch, `isAvailable() → false`, UI shows unavailable. Audio unaffected.
- **`createMediaElementSource` throws** (already tapped elsewhere, exotic page state): catch, mark unavailable, leave audio alone.
- **Storage read/write fails:** best-effort, fall back to defaults / no-op (same pattern as count-in).
- **Ratio at exactly 1:** always route direct (transparent), even when "enabled."
- **AudioContext suspended** (autoplay policy): resume on the first user gesture that engages pitch.

## Testing

Follows the existing pattern: pure logic is unit-tested with vitest; audio/DOM glue is kept thin.

- **`pitchScrub.test.ts`** — drag→semitone snapping, clamping at ±12 / ±50¢, `pitchRatio` correctness (e.g. +12 → 2.0, −12 → 0.5, 0 → 1.0), label formatting. Mirrors `bpmScrub.test.ts`.
- **`pitchStore.test.ts`** — load merges over defaults, clamping, best-effort write fallback, per-video keying (mocked `StorageArea`).
- **`pitchGraph.test.ts`** — branch switching (engaged vs. bypass), auto-bypass at ratio 1, failure → direct + unavailable, lazy-tap (no `createMediaElementSource` until first engage). Web Audio mocked.
- **Manual/spike verification** — the CSP gate (worklet from `chrome.runtime.getURL()` on YouTube) and a listening check that pitch shifts cleanly with tempo unchanged across a range of songs (no Rick Astley).

## Build Order

1. **CSP gate.** Verify a `chrome.runtime.getURL()` worklet module loads on YouTube. Decides AudioWorklet vs. ScriptProcessor. (Spike-level, before committing the engine path.)
2. `pitchScrub.ts` + tests (pure math, TDD).
3. `pitchStore.ts` + tests.
4. `pitchEngine.ts` (SoundTouch core + worklet, with ScriptProcessor fallback) + worklet asset + manifest.
5. `pitchGraph.ts` + tests (routing, lazy tap, failure fallback).
6. `PitchControl.tsx` (scrub pill + popover).
7. Wire into `pageUi.tsx` + render in `LoopPanel.tsx`.
8. End-to-end listening check across several songs; confirm speed independence and per-video persistence.

## Open Questions / Risks

- **CSP gate result** (step 1) — primary unknown; mitigated by the ScriptProcessor fallback.
- **SoundTouch live-streaming API** — the published worklet may be buffer-oriented; if so, wrap the SoundTouch core in our own `AudioWorkletProcessor` reading `inputs[0]`. Known, bounded work.
- **A/V latency** — pitch DSP adds audio latency; expected acceptable for practice looping. Revisit only if users notice.
- **Quality past ±7 semitones** — WSOLA smears at extremes; acceptable for v1, and the `PitchEngine` interface leaves room for Signalsmith if it matters.
