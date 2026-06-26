# Pitch Shift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent pitch-shift control to the Étude YouTube practice looper — transpose the audio in semitones (+ fine cents) without changing playback speed.

**Architecture:** A Web Audio graph taps the YouTube `<video>` element lazily (on first engage) and routes its audio through a pitch-shifting DSP node, with a transparent direct-passthrough branch for the off/zero state. The DSP is the `soundtouchjs` WSOLA core driven in a push loop inside a `ScriptProcessorNode`, hidden behind a swappable `PitchEngine` interface. State persists per video in `browser.storage.local`, mirroring the count-in feature. The UI is a scrub pill + popover mirroring `SpeedControl`.

**Tech Stack:** TypeScript, WXT (Vite), React 19, Web Audio API, `soundtouchjs` (LGPL-2.1), vitest + jsdom + @testing-library/react.

## Global Constraints

- **Independent of speed.** Pitch must not change tempo. Speed stays on `video.playbackRate`; the graph sets `video.preservesPitch = true` so YouTube's own time-stretch holds pitch, and our offset rides on top.
- **Lazy, irreversible tap.** `createMediaElementSource(video)` is one-shot and irreversible; do NOT call it until pitch is first engaged (enabled AND non-zero). Users who never use pitch must get an unmodified audio path.
- **Transparent when off.** At 0 semitones / 0 cents, or disabled, route `inputGain → destination` directly (disconnect the pitch branch). Exactly one branch connected at a time.
- **Never break audio.** Any engine/context failure → connect the direct branch, set `available = false`. Audio always survives.
- **Persistence.** Per-video settings + a global enabled flag in `browser.storage.local` via the `StorageArea` type from `features/persistence/loopStore.ts`. All reads/writes best-effort (try/catch, fall back to defaults / no-op), exactly like `countInStore`.
- **Range.** Semitones integer in `[-12, 12]`; cents integer in `[-50, 50]`. `ratio = 2 ** ((semitones + cents/100) / 12)`.
- **License.** `soundtouchjs` is **LGPL-2.1**. Confirm acceptable before Task 3 (it is the one outward-facing decision; see the spec's Licensing section). Preserve the library's license header in the bundle; keep it an ordinary npm dependency.
- **Follow existing patterns.** `pitchScrub.ts` mirrors `speedScrub.ts`; `pitchStore.ts` mirrors `countInStore.ts` (note: count-in files are NOT in this worktree — mirror the patterns shown in this plan, not those files); `PitchControl.tsx` mirrors `SpeedControl.tsx`.
- **Commands.** Run one test file: `pnpm exec vitest run <path>`. Typecheck: `pnpm typecheck`. Build: `pnpm build`. Tests use explicit `import { describe, expect, it } from "vitest";`.
- **Test videos: never Rick Astley.** Use e.g. Tame Impala — *The Less I Know The Better* (`watch?v=2SUwOgmvzK4`).

---

### Task 1: `pitchScrub.ts` — pure math

**Files:**
- Create: `features/pitch/pitchScrub.ts`
- Test: `features/pitch/pitchScrub.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MIN_SEMITONES = -12`, `MAX_SEMITONES = 12`, `MIN_CENTS = -50`, `MAX_CENTS = 50`, `PX_PER_SEMITONE = 12`
  - `clampSemitones(n: number): number` — round + clamp to `[-12, 12]`
  - `clampCents(n: number): number` — round + clamp to `[-50, 50]`
  - `semitonesFromDrag(startSemitones: number, dyUp: number): number`
  - `pitchRatio(s: { semitones: number; cents: number }): number`
  - `isZeroPitch(s: { semitones: number; cents: number }): boolean`
  - `formatPitch(s: { semitones: number; cents: number }): string`

- [ ] **Step 1: Write the failing test**

Create `features/pitch/pitchScrub.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PX_PER_SEMITONE,
  clampCents,
  clampSemitones,
  formatPitch,
  isZeroPitch,
  pitchRatio,
  semitonesFromDrag
} from "./pitchScrub";

describe("clampSemitones", () => {
  it("rounds and clamps to ±12", () => {
    expect(clampSemitones(2.4)).toBe(2);
    expect(clampSemitones(-2.6)).toBe(-3);
    expect(clampSemitones(13)).toBe(12);
    expect(clampSemitones(-99)).toBe(-12);
  });
});

describe("clampCents", () => {
  it("rounds and clamps to ±50", () => {
    expect(clampCents(12.3)).toBe(12);
    expect(clampCents(60)).toBe(50);
    expect(clampCents(-60)).toBe(-50);
  });
});

describe("semitonesFromDrag", () => {
  it("returns the start within half a step", () => {
    expect(semitonesFromDrag(0, 0)).toBe(0);
    expect(semitonesFromDrag(0, PX_PER_SEMITONE / 2 - 1)).toBe(0);
  });
  it("steps one semitone per PX_PER_SEMITONE of upward drag", () => {
    expect(semitonesFromDrag(0, PX_PER_SEMITONE)).toBe(1);
    expect(semitonesFromDrag(0, -PX_PER_SEMITONE * 2)).toBe(-2);
    expect(semitonesFromDrag(3, PX_PER_SEMITONE * 2)).toBe(5);
  });
  it("clamps at the ends", () => {
    expect(semitonesFromDrag(11, PX_PER_SEMITONE * 5)).toBe(12);
    expect(semitonesFromDrag(-11, -PX_PER_SEMITONE * 5)).toBe(-12);
  });
});

describe("pitchRatio", () => {
  it("maps semitones+cents to a frequency ratio", () => {
    expect(pitchRatio({ semitones: 0, cents: 0 })).toBe(1);
    expect(pitchRatio({ semitones: 12, cents: 0 })).toBeCloseTo(2, 10);
    expect(pitchRatio({ semitones: -12, cents: 0 })).toBeCloseTo(0.5, 10);
    expect(pitchRatio({ semitones: 1, cents: 0 })).toBeCloseTo(1.059463, 5);
    expect(pitchRatio({ semitones: 0, cents: 50 })).toBeCloseTo(1.029302, 5);
  });
});

describe("isZeroPitch", () => {
  it("is true only at exactly zero", () => {
    expect(isZeroPitch({ semitones: 0, cents: 0 })).toBe(true);
    expect(isZeroPitch({ semitones: 0, cents: 5 })).toBe(false);
    expect(isZeroPitch({ semitones: 1, cents: 0 })).toBe(false);
  });
});

describe("formatPitch", () => {
  it("formats semitones with a sign and optional cents", () => {
    expect(formatPitch({ semitones: 0, cents: 0 })).toBe("0");
    expect(formatPitch({ semitones: 3, cents: 0 })).toBe("+3");
    expect(formatPitch({ semitones: -2, cents: 0 })).toBe("-2");
    expect(formatPitch({ semitones: 3, cents: 12 })).toBe("+3 +12¢");
    expect(formatPitch({ semitones: 0, cents: -5 })).toBe("0 -5¢");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/pitch/pitchScrub.test.ts`
Expected: FAIL — `Failed to resolve import "./pitchScrub"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `features/pitch/pitchScrub.ts`:

```ts
// Pure math for the pitch control: drag→semitone mapping, clamping, the
// frequency ratio the DSP engine consumes, and the readout label. No DOM,
// no audio — mirrors speedScrub.ts so it is fully unit-testable.

export const MIN_SEMITONES = -12;
export const MAX_SEMITONES = 12;
export const MIN_CENTS = -50;
export const MAX_CENTS = 50;

/** Vertical pixels of drag per one-semitone step. */
export const PX_PER_SEMITONE = 12;

export function clampSemitones(semitones: number): number {
  return Math.max(MIN_SEMITONES, Math.min(MAX_SEMITONES, Math.round(semitones)));
}

export function clampCents(cents: number): number {
  return Math.max(MIN_CENTS, Math.min(MAX_CENTS, Math.round(cents)));
}

/**
 * Semitone offset after dragging `dyUp` pixels upward (positive = up) from a
 * press that started at `startSemitones`. Quantized to whole semitones,
 * clamped to ±12.
 */
export function semitonesFromDrag(startSemitones: number, dyUp: number): number {
  const steps = Math.round(dyUp / PX_PER_SEMITONE);
  return clampSemitones(startSemitones + steps);
}

/** Frequency ratio for an offset. 0 → 1, +12 → 2, −12 → 0.5. */
export function pitchRatio(settings: { semitones: number; cents: number }): number {
  return Math.pow(2, (settings.semitones + settings.cents / 100) / 12);
}

/** True when the offset is audibly nothing (drives transparent bypass). */
export function isZeroPitch(settings: { semitones: number; cents: number }): boolean {
  return settings.semitones === 0 && settings.cents === 0;
}

/** Readout label: "0", "+3", "-2", "+3 +12¢", "0 -5¢". */
export function formatPitch(settings: { semitones: number; cents: number }): string {
  const { semitones, cents } = settings;
  const semStr = semitones > 0 ? `+${semitones}` : `${semitones}`;
  if (cents === 0) return semStr;
  const centStr = cents > 0 ? `+${cents}` : `${cents}`;
  return `${semStr} ${centStr}¢`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/pitch/pitchScrub.test.ts`
Expected: PASS (6 describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add features/pitch/pitchScrub.ts features/pitch/pitchScrub.test.ts
git commit -m "feat(pitch): pure scrub math (semitones, cents, ratio, label)"
```

---

### Task 2: `pitchStore.ts` — per-video persistence

**Files:**
- Create: `features/persistence/pitchStore.ts`
- Test: `features/persistence/pitchStore.test.ts`

**Interfaces:**
- Consumes: `StorageArea` from `features/persistence/loopStore.ts`; `clampSemitones`, `clampCents` from `features/pitch/pitchScrub.ts`.
- Produces:
  - `PITCH_ENABLED_KEY = "you-loop:pitch"`, `PITCH_KEY_PREFIX = "you-loop:pitch:v:"`
  - `type PitchSettings = { semitones: number; cents: number }`
  - `DEFAULT_PITCH_SETTINGS: PitchSettings` (`{ semitones: 0, cents: 0 }`)
  - `pitchKeyFor(videoId: string): string`
  - `getPitchEnabled(area?: StorageArea): Promise<boolean>`
  - `setPitchEnabled(value: boolean, area?: StorageArea): Promise<void>`
  - `loadPitchSettings(videoId: string, area?: StorageArea): Promise<PitchSettings>`
  - `savePitchSettings(videoId: string, settings: PitchSettings, area?: StorageArea): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `features/persistence/pitchStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { StorageArea } from "./loopStore";
import {
  DEFAULT_PITCH_SETTINGS,
  PITCH_ENABLED_KEY,
  getPitchEnabled,
  loadPitchSettings,
  pitchKeyFor,
  savePitchSettings,
  setPitchEnabled
} from "./pitchStore";

function memArea(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const area: StorageArea = {
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }
  };
  return { area, data };
}

const throwingArea: StorageArea = {
  get: async () => {
    throw new Error("boom");
  },
  set: async () => {
    throw new Error("boom");
  }
};

describe("loadPitchSettings", () => {
  it("returns defaults when nothing is stored", async () => {
    const { area } = memArea();
    expect(await loadPitchSettings("vid", area)).toEqual(DEFAULT_PITCH_SETTINGS);
  });

  it("merges a partial record over defaults", async () => {
    const { area } = memArea({ [pitchKeyFor("vid")]: { semitones: 3 } });
    expect(await loadPitchSettings("vid", area)).toEqual({ semitones: 3, cents: 0 });
  });

  it("clamps out-of-range stored values", async () => {
    const { area } = memArea({ [pitchKeyFor("vid")]: { semitones: 99, cents: -200 } });
    expect(await loadPitchSettings("vid", area)).toEqual({ semitones: 12, cents: -50 });
  });

  it("falls back to defaults when the area throws", async () => {
    expect(await loadPitchSettings("vid", throwingArea)).toEqual(DEFAULT_PITCH_SETTINGS);
  });
});

describe("savePitchSettings", () => {
  it("writes under the per-video key", async () => {
    const { area, data } = memArea();
    await savePitchSettings("vid", { semitones: -2, cents: 10 }, area);
    expect(data[pitchKeyFor("vid")]).toEqual({ semitones: -2, cents: 10 });
  });

  it("does not throw when the area throws", async () => {
    await expect(
      savePitchSettings("vid", { semitones: 1, cents: 0 }, throwingArea)
    ).resolves.toBeUndefined();
  });
});

describe("pitch enabled flag", () => {
  it("is true only when explicitly true", async () => {
    const { area } = memArea();
    expect(await getPitchEnabled(area)).toBe(false);
    await setPitchEnabled(true, area);
    expect(await getPitchEnabled(area)).toBe(true);
  });

  it("reads false from a throwing area", async () => {
    expect(await getPitchEnabled(throwingArea)).toBe(false);
  });

  it("stores under the global key", async () => {
    const { area, data } = memArea();
    await setPitchEnabled(true, area);
    expect(data[PITCH_ENABLED_KEY]).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/persistence/pitchStore.test.ts`
Expected: FAIL — cannot resolve `./pitchStore`.

- [ ] **Step 3: Write the implementation**

Create `features/persistence/pitchStore.ts`:

```ts
import type { StorageArea } from "./loopStore";
import { clampCents, clampSemitones } from "../pitch/pitchScrub";

export const PITCH_ENABLED_KEY = "you-loop:pitch";
// fallow-ignore-next-line unused-export
export const PITCH_KEY_PREFIX = "you-loop:pitch:v:";

export type PitchSettings = {
  semitones: number;
  cents: number;
};

export const DEFAULT_PITCH_SETTINGS: PitchSettings = { semitones: 0, cents: 0 };

export function pitchKeyFor(videoId: string): string {
  return PITCH_KEY_PREFIX + videoId;
}

function resolveArea(area?: StorageArea): StorageArea {
  return area ?? (browser.storage.local as unknown as StorageArea);
}

export async function getPitchEnabled(area?: StorageArea): Promise<boolean> {
  try {
    const r = await resolveArea(area).get(PITCH_ENABLED_KEY);
    return r[PITCH_ENABLED_KEY] === true;
  } catch {
    return false;
  }
}

export async function setPitchEnabled(
  value: boolean,
  area?: StorageArea
): Promise<void> {
  try {
    await resolveArea(area).set({ [PITCH_ENABLED_KEY]: value });
  } catch {
    // Best-effort: a failed write leaves the prior value intact.
  }
}

export async function loadPitchSettings(
  videoId: string,
  area?: StorageArea
): Promise<PitchSettings> {
  const key = pitchKeyFor(videoId);
  try {
    const r = await resolveArea(area).get(key);
    const raw = r[key];
    if (raw == null || typeof raw !== "object") return DEFAULT_PITCH_SETTINGS;
    const merged = { ...DEFAULT_PITCH_SETTINGS, ...(raw as Partial<PitchSettings>) };
    return {
      semitones: clampSemitones(merged.semitones),
      cents: clampCents(merged.cents)
    };
  } catch {
    return DEFAULT_PITCH_SETTINGS;
  }
}

export async function savePitchSettings(
  videoId: string,
  settings: PitchSettings,
  area?: StorageArea
): Promise<void> {
  try {
    await resolveArea(area).set({ [pitchKeyFor(videoId)]: settings });
  } catch {
    // Best-effort.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/persistence/pitchStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/persistence/pitchStore.ts features/persistence/pitchStore.test.ts
git commit -m "feat(pitch): per-video pitch settings + enabled flag store"
```

---

### Task 3: `pitchEngine.ts` — SoundTouch DSP in a ScriptProcessorNode

> **License gate:** This task adds `soundtouchjs` (LGPL-2.1). Confirm acceptable before proceeding (see Global Constraints).

**Files:**
- Create: `features/pitch/pitchEngine.ts`
- Create: `features/pitch/soundtouchjs.d.ts` (ambient types — the package ships none)
- Test: `features/pitch/pitchEngine.test.ts`
- Modify: `package.json` (add dependency)

**Interfaces:**
- Consumes: `soundtouchjs` (`SoundTouch` class).
- Produces:
  - `interface PitchEngine { readonly node: AudioNode; setRatio(ratio: number): void; dispose(): void; }`
  - `interface SoundTouchLike { tempo: number; rate: number; pitch: number; readonly inputBuffer: { putSamples(s: Float32Array, position?: number, numFrames?: number): void }; readonly outputBuffer: { readonly frameCount: number; receiveSamples(o: Float32Array, numFrames?: number): void }; process(): void; clear(): void; }`
  - `createScriptProcessorEngine(ctx: AudioContext, createSoundTouch?: () => SoundTouchLike): PitchEngine`
  - `createPitchEngine(ctx: AudioContext): Promise<PitchEngine>`

- [ ] **Step 1: Add the dependency**

```bash
pnpm add soundtouchjs@0.3.0
```

Expected: `package.json` gains `"soundtouchjs": "0.3.0"` under `dependencies`.

- [ ] **Step 2: Write the ambient type declaration**

Create `features/pitch/soundtouchjs.d.ts`:

```ts
// soundtouchjs (LGPL-2.1) ships no types. Declare only the low-level surface
// we drive in the push loop (its higher-level PitchShifter/getWebAudioNode
// helpers are pull-from-buffer and unused here).
declare module "soundtouchjs" {
  export class FifoSampleBuffer {
    readonly frameCount: number;
    putSamples(samples: Float32Array, position?: number, numFrames?: number): void;
    receiveSamples(output: Float32Array, numFrames?: number): void;
    clear(): void;
  }
  export class SoundTouch {
    tempo: number;
    rate: number;
    pitch: number;
    pitchSemitones: number;
    readonly inputBuffer: FifoSampleBuffer;
    readonly outputBuffer: FifoSampleBuffer;
    process(): void;
    clear(): void;
  }
}
```

- [ ] **Step 3: Write the failing test**

Create `features/pitch/pitchEngine.test.ts`. It injects a fake `AudioContext` and a fake `SoundTouch` (identity echo) so the marshalling logic is tested without real Web Audio or DSP:

```ts
import { describe, expect, it, vi } from "vitest";
import { createScriptProcessorEngine, type SoundTouchLike } from "./pitchEngine";

// Identity SoundTouch: whatever is pushed in comes straight back out.
function fakeSoundTouch(): SoundTouchLike {
  let stored = new Float32Array(0);
  return {
    tempo: 0,
    rate: 0,
    pitch: 0,
    inputBuffer: {
      putSamples(s: Float32Array, position = 0, numFrames = 0) {
        stored = s.slice(position * 2, position * 2 + numFrames * 2);
      }
    },
    outputBuffer: {
      get frameCount() {
        return stored.length / 2;
      },
      receiveSamples(o: Float32Array, numFrames = 0) {
        o.set(stored.subarray(0, numFrames * 2));
      }
    },
    process() {},
    clear() {}
  };
}

function fakeContext() {
  const node = {
    onaudioprocess: null as ((e: unknown) => void) | null,
    connect: vi.fn(),
    disconnect: vi.fn()
  };
  return {
    ctx: { createScriptProcessor: vi.fn(() => node) } as unknown as AudioContext,
    node
  };
}

function fakeEvent(inL: number[], inR: number[]) {
  const outL = new Float32Array(inL.length);
  const outR = new Float32Array(inL.length);
  return {
    event: {
      inputBuffer: {
        numberOfChannels: 2,
        getChannelData: (c: number) =>
          c === 0 ? Float32Array.from(inL) : Float32Array.from(inR)
      },
      outputBuffer: {
        numberOfChannels: 2,
        getChannelData: (c: number) => (c === 0 ? outL : outR)
      }
    },
    outL,
    outR
  };
}

describe("createScriptProcessorEngine", () => {
  it("passes interleaved audio through the SoundTouch push loop", () => {
    const { ctx, node } = fakeContext();
    const engine = createScriptProcessorEngine(ctx, fakeSoundTouch);
    expect(engine.node).toBe(node);

    const { event, outL, outR } = fakeEvent([1, 2, 3, 4], [5, 6, 7, 8]);
    node.onaudioprocess!(event);

    expect(Array.from(outL)).toEqual([1, 2, 3, 4]);
    expect(Array.from(outR)).toEqual([5, 6, 7, 8]);
  });

  it("setRatio sets the SoundTouch pitch", () => {
    const st = fakeSoundTouch();
    const { ctx } = fakeContext();
    const engine = createScriptProcessorEngine(ctx, () => st);
    engine.setRatio(1.5);
    expect(st.pitch).toBe(1.5);
  });

  it("zero-fills when the output FIFO underflows", () => {
    // A SoundTouch that never yields output → pure underflow.
    const empty: SoundTouchLike = {
      tempo: 0,
      rate: 0,
      pitch: 0,
      inputBuffer: { putSamples() {} },
      outputBuffer: { frameCount: 0, receiveSamples() {} },
      process() {},
      clear() {}
    };
    const { ctx, node } = fakeContext();
    createScriptProcessorEngine(ctx, () => empty);
    const { event, outL, outR } = fakeEvent([9, 9, 9, 9], [9, 9, 9, 9]);
    node.onaudioprocess!(event);
    expect(Array.from(outL)).toEqual([0, 0, 0, 0]);
    expect(Array.from(outR)).toEqual([0, 0, 0, 0]);
  });

  it("dispose clears the handler and disconnects", () => {
    const { ctx, node } = fakeContext();
    const engine = createScriptProcessorEngine(ctx, fakeSoundTouch);
    engine.dispose();
    expect(node.onaudioprocess).toBeNull();
    expect(node.disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run features/pitch/pitchEngine.test.ts`
Expected: FAIL — cannot resolve `./pitchEngine`.

- [ ] **Step 5: Write the implementation**

Create `features/pitch/pitchEngine.ts`:

```ts
import { SoundTouch } from "soundtouchjs";

export interface PitchEngine {
  /** Connect the source into this node; connect this node onward to the graph. */
  readonly node: AudioNode;
  /** 1 = no shift, 2 = +1 octave, 0.5 = −1 octave. */
  setRatio(ratio: number): void;
  dispose(): void;
}

// The slice of SoundTouch we drive. Declared here so the engine can be tested
// with a fake (jsdom has no Web Audio and no real DSP).
export interface SoundTouchLike {
  tempo: number;
  rate: number;
  pitch: number;
  readonly inputBuffer: {
    putSamples(samples: Float32Array, position?: number, numFrames?: number): void;
  };
  readonly outputBuffer: {
    readonly frameCount: number;
    receiveSamples(output: Float32Array, numFrames?: number): void;
  };
  process(): void;
  clear(): void;
}

// 4096 frames ≈ 85ms at 48kHz: the largest ScriptProcessor block, so the
// fewest callbacks and the most headroom against main-thread jank. Latency is
// irrelevant for a practice loop with no external sync.
const BUFFER_SIZE = 4096;

// Live-stream pitch shift driven by the low-level SoundTouch class (push
// model): each callback interleaves the input, pushes it through SoundTouch,
// then pulls back whatever processed frames are ready, zero-filling the
// priming underflow during the first callbacks.
export function createScriptProcessorEngine(
  ctx: AudioContext,
  createSoundTouch: () => SoundTouchLike = () => new SoundTouch()
): PitchEngine {
  const soundtouch = createSoundTouch();
  soundtouch.tempo = 1;
  soundtouch.rate = 1;
  soundtouch.pitch = 1;

  const node = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);
  const inInterleaved = new Float32Array(BUFFER_SIZE * 2);
  const outInterleaved = new Float32Array(BUFFER_SIZE * 2);

  node.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer;
    const output = event.outputBuffer;
    const inL = input.getChannelData(0);
    const inR = input.numberOfChannels > 1 ? input.getChannelData(1) : inL;
    const outL = output.getChannelData(0);
    const outR = output.getChannelData(1);
    const frames = inL.length;

    for (let i = 0; i < frames; i++) {
      inInterleaved[i * 2] = inL[i];
      inInterleaved[i * 2 + 1] = inR[i];
    }
    soundtouch.inputBuffer.putSamples(inInterleaved, 0, frames);
    soundtouch.process();

    const ready = Math.min(frames, soundtouch.outputBuffer.frameCount);
    if (ready > 0) soundtouch.outputBuffer.receiveSamples(outInterleaved, ready);
    for (let i = 0; i < ready; i++) {
      outL[i] = outInterleaved[i * 2];
      outR[i] = outInterleaved[i * 2 + 1];
    }
    for (let i = ready; i < frames; i++) {
      outL[i] = 0;
      outR[i] = 0;
    }
  };

  return {
    node,
    setRatio(ratio: number) {
      soundtouch.pitch = ratio;
    },
    dispose() {
      node.onaudioprocess = null;
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
      soundtouch.clear();
    }
  };
}

// The async boundary the v2 AudioWorklet engine will need. v1 resolves
// immediately with the ScriptProcessor engine.
export async function createPitchEngine(ctx: AudioContext): Promise<PitchEngine> {
  return createScriptProcessorEngine(ctx);
}
```

- [ ] **Step 6: Run test + typecheck**

Run: `pnpm exec vitest run features/pitch/pitchEngine.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors (the ambient `soundtouchjs.d.ts` resolves the import; if tsc reports it cannot find the module, confirm the `.d.ts` is under the project `include`).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml features/pitch/pitchEngine.ts features/pitch/pitchEngine.test.ts features/pitch/soundtouchjs.d.ts
git commit -m "feat(pitch): SoundTouch pitch engine (ScriptProcessor push loop)"
```

---

### Task 4: `pitchGraph.ts` — audio routing, lazy tap, bypass, fallback

**Files:**
- Create: `features/pitch/pitchGraph.ts`
- Test: `features/pitch/pitchGraph.test.ts`

**Interfaces:**
- Consumes: `createPitchEngine`, `PitchEngine` from `./pitchEngine`; `pitchRatio`, `isZeroPitch` from `./pitchScrub`; `PitchSettings` from `../persistence/pitchStore`.
- Produces:
  - `interface PitchGraph { setEnabled(on: boolean): void; setSettings(s: PitchSettings): void; isAvailable(): boolean; dispose(): void; }`
  - `interface PitchGraphDeps { createContext: () => AudioContext; createEngine: (ctx: AudioContext) => Promise<PitchEngine>; }`
  - `createPitchGraph(video: HTMLVideoElement, deps?: PitchGraphDeps): PitchGraph`

- [ ] **Step 1: Write the failing test**

Create `features/pitch/pitchGraph.test.ts`. It injects fake context/engine and asserts the lazy-tap, bypass, and failure rules:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPitchGraph, type PitchGraphDeps } from "./pitchGraph";
import type { PitchEngine } from "./pitchEngine";

function fakeGain() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function makeDeps() {
  const destination = {};
  const gain = fakeGain();
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const createMediaElementSource = vi.fn(() => source);
  const ctx = {
    state: "running",
    destination,
    createGain: vi.fn(() => gain),
    createMediaElementSource,
    resume: vi.fn(),
    close: vi.fn()
  } as unknown as AudioContext;

  const engineNode = { connect: vi.fn(), disconnect: vi.fn() };
  const engine: PitchEngine = {
    node: engineNode as unknown as AudioNode,
    setRatio: vi.fn(),
    dispose: vi.fn()
  };

  const deps: PitchGraphDeps = {
    createContext: vi.fn(() => ctx),
    createEngine: vi.fn(async () => engine)
  };
  return { deps, ctx, gain, source, engine, engineNode, destination, createMediaElementSource };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const video = {} as HTMLVideoElement;

describe("createPitchGraph", () => {
  it("does not tap the element until pitch is engaged", () => {
    const { deps, createMediaElementSource } = makeDeps();
    const graph = createPitchGraph(video, deps);
    graph.setEnabled(true); // enabled but still at 0/0 → no audible pitch
    graph.setSettings({ semitones: 3, cents: 0 }); // non-zero but enabled was reset?
    // enabled=true AND non-zero now → SHOULD tap
    expect(createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it("stays untapped while disabled even with a non-zero offset", () => {
    const { deps, createMediaElementSource } = makeDeps();
    const graph = createPitchGraph(video, deps);
    graph.setSettings({ semitones: 5, cents: 0 }); // not enabled
    expect(createMediaElementSource).not.toHaveBeenCalled();
  });

  it("engages the pitch branch and sets the ratio", async () => {
    const { deps, gain, engine, engineNode, ctx } = makeDeps();
    const graph = createPitchGraph(video, deps);
    graph.setSettings({ semitones: 12, cents: 0 });
    graph.setEnabled(true);
    await flush();
    expect(engine.setRatio).toHaveBeenCalledWith(2); // +12 semis → ratio 2
    expect(gain.connect).toHaveBeenCalledWith(engineNode);
    expect(gain.disconnect).toHaveBeenCalledWith((ctx as AudioContext).destination);
  });

  it("routes directly (transparent) when set back to zero", async () => {
    const { deps, gain, engineNode, ctx } = makeDeps();
    const graph = createPitchGraph(video, deps);
    graph.setSettings({ semitones: 3, cents: 0 });
    graph.setEnabled(true);
    await flush();
    gain.connect.mockClear();
    gain.disconnect.mockClear();
    graph.setSettings({ semitones: 0, cents: 0 });
    expect(gain.connect).toHaveBeenCalledWith((ctx as AudioContext).destination);
    expect(gain.disconnect).toHaveBeenCalledWith(engineNode);
  });

  it("falls back to direct + unavailable when the engine fails", async () => {
    const { deps, gain, ctx } = makeDeps();
    (deps.createEngine as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("no worklet"));
    const graph = createPitchGraph(video, deps);
    graph.setSettings({ semitones: 3, cents: 0 });
    graph.setEnabled(true);
    await flush();
    expect(graph.isAvailable()).toBe(false);
    expect(gain.connect).toHaveBeenCalledWith((ctx as AudioContext).destination);
  });

  it("dispose closes the context", async () => {
    const { deps, ctx, engine } = makeDeps();
    const graph = createPitchGraph(video, deps);
    graph.setSettings({ semitones: 3, cents: 0 });
    graph.setEnabled(true);
    await flush();
    graph.dispose();
    expect(engine.dispose).toHaveBeenCalled();
    expect((ctx as AudioContext).close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/pitch/pitchGraph.test.ts`
Expected: FAIL — cannot resolve `./pitchGraph`.

- [ ] **Step 3: Write the implementation**

Create `features/pitch/pitchGraph.ts`:

```ts
import { createPitchEngine, type PitchEngine } from "./pitchEngine";
import { isZeroPitch, pitchRatio } from "./pitchScrub";
import type { PitchSettings } from "../persistence/pitchStore";

export interface PitchGraph {
  setEnabled(on: boolean): void;
  setSettings(settings: PitchSettings): void;
  isAvailable(): boolean;
  dispose(): void;
}

export interface PitchGraphDeps {
  createContext: () => AudioContext;
  createEngine: (ctx: AudioContext) => Promise<PitchEngine>;
}

const defaultDeps: PitchGraphDeps = {
  createContext: () => new AudioContext(),
  createEngine: createPitchEngine
};

// Owns the video's Web Audio graph. The only module that calls
// createMediaElementSource — which is one-shot and irreversible, hence the
// lazy tap and the always-transparent bypass.
export function createPitchGraph(
  video: HTMLVideoElement,
  deps: PitchGraphDeps = defaultDeps
): PitchGraph {
  let enabled = false;
  let settings: PitchSettings = { semitones: 0, cents: 0 };
  let available = true;
  let tapping = false;
  let tapped = false;
  let failed = false;

  let ctx: AudioContext | null = null;
  let inputGain: GainNode | null = null;
  let engine: PitchEngine | null = null;
  let branch: "none" | "direct" | "pitch" = "none";

  // True when the user wants audible processing right now.
  const wantsPitch = () => enabled && !isZeroPitch(settings) && !failed;

  const connectDirect = () => {
    if (ctx == null || inputGain == null || branch === "direct") return;
    if (engine != null) {
      try {
        inputGain.disconnect(engine.node);
      } catch {
        // not connected
      }
    }
    inputGain.connect(ctx.destination);
    branch = "direct";
  };

  const connectPitch = () => {
    if (ctx == null || inputGain == null || engine == null || branch === "pitch") return;
    try {
      inputGain.disconnect(ctx.destination);
    } catch {
      // not connected
    }
    inputGain.connect(engine.node);
    branch = "pitch";
  };

  // Reconcile the live graph with the desired state.
  const apply = () => {
    if (ctx == null || inputGain == null) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (engine != null) engine.setRatio(pitchRatio(settings));
    if (wantsPitch() && engine != null) connectPitch();
    else connectDirect();
  };

  // First real engage: irreversibly tap the element and build the graph.
  const ensureTapped = async () => {
    if (tapped || tapping || failed) return;
    tapping = true;
    try {
      ctx = deps.createContext();
      // Keep YouTube's own time-stretch pitch-correct so speed changes never
      // move pitch; our offset rides on top.
      video.preservesPitch = true;
      const source = ctx.createMediaElementSource(video);
      inputGain = ctx.createGain();
      source.connect(inputGain);
      engine = await deps.createEngine(ctx);
      engine.node.connect(ctx.destination);
      tapped = true;
      apply();
    } catch {
      failed = true;
      available = false;
      // Best-effort: if we tapped far enough, route straight through.
      connectDirect();
    } finally {
      tapping = false;
    }
  };

  return {
    setEnabled(on: boolean) {
      enabled = on;
      if (wantsPitch() && !tapped) {
        void ensureTapped();
        return;
      }
      apply();
    },
    setSettings(next: PitchSettings) {
      settings = next;
      if (wantsPitch() && !tapped) {
        void ensureTapped();
        return;
      }
      apply();
    },
    isAvailable() {
      return available;
    },
    dispose() {
      try {
        engine?.dispose();
      } catch {
        // ignore
      }
      try {
        inputGain?.disconnect();
      } catch {
        // ignore
      }
      try {
        void ctx?.close();
      } catch {
        // ignore
      }
      ctx = null;
      inputGain = null;
      engine = null;
      branch = "none";
      tapped = false;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/pitch/pitchGraph.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add features/pitch/pitchGraph.ts features/pitch/pitchGraph.test.ts
git commit -m "feat(pitch): audio graph with lazy tap, transparent bypass, fallback"
```

---

### Task 5: `PitchControl.tsx` — scrub pill + popover, and styles

**Files:**
- Create: `features/player-overlay/PitchControl.tsx`
- Create: `features/player-overlay/PitchControl.test.tsx`
- Modify: `entrypoints/content/pageUi.styles.ts` (append the `.you-loop-pitch*` block after the `.you-loop-speed*` block, before the closing backtick of `PAGE_UI_STYLES`)

**Interfaces:**
- Consumes: `PitchSettings` from `../persistence/pitchStore`; `MIN_CENTS`, `MAX_CENTS`, `clampCents`, `formatPitch`, `semitonesFromDrag` from `../pitch/pitchScrub`.
- Produces: `PitchControl(props)` where
  ```ts
  type Props = {
    settings: PitchSettings;
    enabled: boolean;
    available: boolean;
    disabled: boolean;
    container: HTMLElement | null;
    onChange: (settings: PitchSettings) => void;
    onToggleEnabled: () => void;
    onReset: () => void;
  };
  ```

- [ ] **Step 1: Write the failing test**

Create `features/player-overlay/PitchControl.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PitchControl } from "./PitchControl";
import { PX_PER_SEMITONE } from "../pitch/pitchScrub";

const base = {
  settings: { semitones: 0, cents: 0 },
  enabled: false,
  available: true,
  disabled: false,
  container: document.body,
  onChange: () => {},
  onToggleEnabled: () => {},
  onReset: () => {}
};

afterEach(() => cleanup());

describe("PitchControl", () => {
  it("shows the formatted offset on the slider", () => {
    render(<PitchControl {...base} settings={{ semitones: 3, cents: 0 }} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "+3");
  });

  it("a plain click opens the popover", () => {
    render(<PitchControl {...base} />);
    const chip = screen.getByRole("slider");
    fireEvent.pointerDown(chip, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(chip, { pointerId: 1, clientY: 100 });
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("dragging up raises semitones", () => {
    const onChange = vi.fn();
    render(<PitchControl {...base} onChange={onChange} />);
    const chip = screen.getByRole("slider");
    fireEvent.pointerDown(chip, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientY: 100 - PX_PER_SEMITONE });
    expect(onChange).toHaveBeenCalledWith({ semitones: 1, cents: 0 });
  });

  it("reset and on/off in the popover call their handlers", () => {
    const onReset = vi.fn();
    const onToggleEnabled = vi.fn();
    render(
      <PitchControl
        {...base}
        settings={{ semitones: 3, cents: 0 }}
        onReset={onReset}
        onToggleEnabled={onToggleEnabled}
      />
    );
    const chip = screen.getByRole("slider");
    fireEvent.pointerDown(chip, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(chip, { pointerId: 1, clientY: 100 });
    fireEvent.click(screen.getByText("Reset"));
    fireEvent.click(screen.getByRole("switch"));
    expect(onReset).toHaveBeenCalled();
    expect(onToggleEnabled).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/player-overlay/PitchControl.test.tsx`
Expected: FAIL — cannot resolve `./PitchControl`.

- [ ] **Step 3: Write the component**

Create `features/player-overlay/PitchControl.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  CSSProperties,
  MouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type { PitchSettings } from "../persistence/pitchStore";
import {
  MAX_CENTS,
  MIN_CENTS,
  clampCents,
  formatPitch,
  semitonesFromDrag
} from "../pitch/pitchScrub";

type Props = {
  settings: PitchSettings;
  enabled: boolean;
  available: boolean;
  disabled: boolean;
  /** Portal host for the popover (the player element); the panel cluster clips
      overflow, so the popover cannot live inside the pill. */
  container: HTMLElement | null;
  onChange: (settings: PitchSettings) => void;
  onToggleEnabled: () => void;
  onReset: () => void;
};

const POP_EXIT_MS = 140;

const swallow = (event: MouseEvent | ReactPointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function PitchControl({
  settings,
  enabled,
  available,
  disabled,
  container,
  onChange,
  onToggleEnabled,
  onReset
}: Props) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startSemitones: number;
    moved: boolean;
    accY: number;
  } | null>(null);
  const exitTimerRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });

  useEffect(() => () => window.clearTimeout(exitTimerRef.current), []);

  const blocked = disabled || !available;

  // Pin our overlay and YouTube's chrome visible while scrubbing, hiding the
  // cursor (reusing the speed-scrub flag's CSS rule).
  const setDragLock = (on: boolean) => {
    const chip = chipRef.current;
    if (chip == null) return;
    const ui = chip.closest<HTMLElement>(".you-loop-page-ui");
    const player = chip.closest<HTMLElement>(".html5-video-player");
    if (on) {
      if (ui != null) ui.dataset.dragging = "true";
      if (player != null) {
        player.dataset.youLoopScrubbing = "true";
        player.dataset.youLoopSpeedScrub = "true";
      }
    } else {
      if (ui != null) delete ui.dataset.dragging;
      if (player != null) {
        delete player.dataset.youLoopScrubbing;
        delete player.dataset.youLoopSpeedScrub;
      }
    }
  };

  // The drag's release can land over a YouTube control; swallow the synthetic
  // click once, in capture, so the gesture stays ours.
  const suppressNextClick = () => {
    const swallowOnce = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallowOnce, { capture: true, once: true });
    window.setTimeout(() => {
      window.removeEventListener("click", swallowOnce, { capture: true });
    }, 250);
  };

  const updateAnchor = () => {
    const chip = chipRef.current;
    if (chip == null || container == null) return;
    const chipRect = chip.getBoundingClientRect();
    const hostRect = container.getBoundingClientRect();
    const left = chipRect.left + chipRect.width / 2 - hostRect.left;
    const top = chipRect.top - hostRect.top;
    setAnchor((prev) =>
      prev.left === left && prev.top === top ? prev : { left, top }
    );
  };

  const openPopover = () => {
    window.clearTimeout(exitTimerRef.current);
    setClosing(false);
    updateAnchor();
    setOpen(true);
  };

  const closePopover = () => {
    setClosing(true);
    exitTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, POP_EXIT_MS);
  };

  const togglePopover = () => {
    if (open && !closing) closePopover();
    else openPopover();
  };

  const endDrag = () => {
    dragRef.current = null;
    if (document.pointerLockElement === chipRef.current) {
      document.exitPointerLock?.();
    }
    setDragLock(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    swallow(event);
    if (blocked || dragRef.current != null) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startSemitones: settings.semitones,
      moved: false,
      accY: 0
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // keep the drag alive
    }
    try {
      const lock = event.currentTarget.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      lock?.catch?.(() => {});
    } catch {
      // keep the drag alive
    }
    setDragLock(true);
  };

  const trackTravel = (
    drag: NonNullable<typeof dragRef.current>,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (document.pointerLockElement === chipRef.current) {
      drag.accY += event.movementY ?? 0;
    } else {
      drag.accY = event.clientY - drag.startY;
    }
    if (Math.abs(drag.accY) > 2) drag.moved = true;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    swallow(event);
    trackTravel(drag, event);
    const next = semitonesFromDrag(drag.startSemitones, -drag.accY);
    if (next !== settings.semitones) onChange({ ...settings, semitones: next });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    swallow(event);
    trackTravel(drag, event);
    const moved = drag.moved;
    endDrag();
    if (moved) suppressNextClick();
    else togglePopover();
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    if (settings.semitones !== drag.startSemitones) {
      onChange({ ...settings, semitones: drag.startSemitones });
    }
    endDrag();
  };

  const onLostCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (document.pointerLockElement === chipRef.current) return;
    onPointerCancel(event);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePopover();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scrubbing = dragRef.current != null;
  const label = formatPitch(settings);
  const modified = settings.semitones !== 0 || settings.cents !== 0;

  return (
    <div
      className="you-loop-pitch"
      role="group"
      aria-label="Pitch"
      data-disabled={blocked}
    >
      <button
        ref={chipRef}
        type="button"
        role="slider"
        aria-label="Pitch — drag up or down to transpose by semitones, click for fine tuning and on/off"
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={settings.semitones}
        aria-valuetext={label}
        className="you-loop-pitch-value"
        title="Drag ↕ pitch · click for fine / on-off / reset"
        data-modified={modified}
        data-scrubbing={scrubbing}
        data-off={!enabled}
        disabled={blocked}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostCapture}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <span className="you-loop-pitch-num">{label}</span>
        <span className="you-loop-pitch-unit">st</span>
      </button>

      {open &&
        container != null &&
        createPortal(
          <div
            className="you-loop-pitch-pop"
            data-closing={closing}
            style={
              { left: `${anchor.left}px`, top: `${anchor.top}px` } as CSSProperties
            }
            onPointerDown={swallow}
            onMouseDown={swallow}
            onClick={swallow}
          >
            <div className="you-loop-pitch-pop-row">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={enabled ? "Turn pitch off" : "Turn pitch on"}
                className="you-loop-pitch-switch"
                data-on={enabled}
                onClick={(e) => {
                  swallow(e);
                  onToggleEnabled();
                }}
              >
                {enabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                className="you-loop-pitch-reset"
                onClick={(e) => {
                  swallow(e);
                  onReset();
                }}
              >
                Reset
              </button>
            </div>
            <label className="you-loop-pitch-fine">
              <span className="you-loop-pitch-fine-label">Fine</span>
              <input
                type="range"
                min={MIN_CENTS}
                max={MAX_CENTS}
                step={1}
                value={settings.cents}
                onChange={(e) =>
                  onChange({ ...settings, cents: clampCents(Number(e.target.value)) })
                }
              />
              <span className="you-loop-pitch-fine-value">
                {settings.cents > 0 ? `+${settings.cents}` : settings.cents}¢
              </span>
            </label>
          </div>,
          container
        )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/player-overlay/PitchControl.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 5: Add the styles**

In `entrypoints/content/pageUi.styles.ts`, find the end of the `.you-loop-speed*` rules (the `.you-loop-speed-reset-word` block, ~line 676) and add this block immediately after it (it must stay inside the `PAGE_UI_STYLES` template string):

```css
    .you-loop-pitch {
      align-items: center;
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      padding: 2px;
      transition: opacity 0.18s ease;
    }

    .you-loop-pitch[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-pitch-value {
      align-items: baseline;
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.78);
      cursor: ns-resize;
      display: flex;
      gap: 1px;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      height: 27px;
      justify-content: center;
      letter-spacing: 0.01em;
      min-width: 46px;
      padding: 0 8px;
      touch-action: none;
      transition: color 0.15s ease, transform 0.15s ease;
      user-select: none;
      -webkit-user-select: none;
    }

    .you-loop-pitch-value:not(:disabled):hover {
      color: #ffffff;
    }

    .you-loop-pitch-value:disabled {
      cursor: default;
    }

    .you-loop-pitch-unit {
      font-size: 10px;
      opacity: 0.7;
    }

    .you-loop-pitch-value[data-modified="true"] {
      color: #5eead4;
    }

    /* Bypassed (switched off): muted even if an offset is dialled in. */
    .you-loop-pitch-value[data-off="true"][data-modified="true"] {
      color: rgba(255, 255, 255, 0.5);
    }

    .you-loop-pitch-value[data-scrubbing="true"] {
      color: #5eead4;
      transform: scale(1.12);
    }

    .you-loop-pitch-pop {
      position: absolute;
      transform: translate(-50%, calc(-100% - 10px));
      z-index: 60;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 168px;
      padding: 10px;
      border-radius: 12px;
      background: rgba(20, 20, 20, 0.96);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      animation: you-loop-speed-pop-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      color: #fff;
    }

    .you-loop-pitch-pop[data-closing="true"] {
      animation: you-loop-speed-pop-out 0.14s ease both;
    }

    .you-loop-pitch-pop-row {
      display: flex;
      gap: 8px;
    }

    .you-loop-pitch-switch,
    .you-loop-pitch-reset {
      flex: 1;
      height: 26px;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85);
      background: rgba(255, 255, 255, 0.1);
      transition: background 0.15s ease, color 0.15s ease;
    }

    .you-loop-pitch-switch:hover,
    .you-loop-pitch-reset:hover {
      background: rgba(255, 255, 255, 0.16);
    }

    .you-loop-pitch-switch[data-on="true"] {
      background: #5eead4;
      color: #06302b;
    }

    .you-loop-pitch-fine {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
    }

    .you-loop-pitch-fine-label {
      min-width: 26px;
    }

    .you-loop-pitch-fine input[type="range"] {
      flex: 1;
      accent-color: #5eead4;
    }

    .you-loop-pitch-fine-value {
      min-width: 34px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
```

- [ ] **Step 6: Typecheck and full test run**

Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm exec vitest run features/pitch features/player-overlay/PitchControl.test.tsx features/persistence/pitchStore.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add features/player-overlay/PitchControl.tsx features/player-overlay/PitchControl.test.tsx entrypoints/content/pageUi.styles.ts
git commit -m "feat(pitch): scrub-pill + popover control with styles"
```

---

### Task 6: Wire into `pageUi.tsx` and `LoopPanel.tsx`

**Files:**
- Modify: `features/player-overlay/LoopPanel.tsx` (props + render `PitchControl`)
- Modify: `entrypoints/content/pageUi.tsx` (instantiate graph, state, handlers, load, render props, teardown)

**Interfaces:**
- Consumes: `createPitchGraph` (`../pitch/pitchGraph`); `getPitchEnabled`, `setPitchEnabled`, `loadPitchSettings`, `savePitchSettings`, `DEFAULT_PITCH_SETTINGS`, `PitchSettings` (`../persistence/pitchStore` — from `pageUi.tsx`'s perspective, `../../features/...`); `PitchControl` (`./PitchControl` from `LoopPanel.tsx`).
- Produces: no new exports; pure wiring.

There is no unit test for this glue (it is imperative DOM wiring, like the existing speed/loop wiring); it is verified by `pnpm typecheck`, `pnpm build`, and the Task 7 manual check.

- [ ] **Step 1: Extend `LoopPanel.tsx` props and imports**

In `features/player-overlay/LoopPanel.tsx`, add imports near the top (after the `SpeedControl` import on line 3):

```tsx
import { PitchControl } from "./PitchControl";
import type { PitchSettings } from "../persistence/pitchStore";
```

Add these fields to the `Props` type (after `onResetSpeed: () => void;`):

```tsx
  pitchSettings: PitchSettings;
  pitchEnabled: boolean;
  pitchAvailable: boolean;
  onPitchChange: (settings: PitchSettings) => void;
  onTogglePitch: () => void;
  onResetPitch: () => void;
```

Add the matching names to the destructured parameter list (after `onResetSpeed,`):

```tsx
  pitchSettings,
  pitchEnabled,
  pitchAvailable,
  onPitchChange,
  onTogglePitch,
  onResetPitch,
```

- [ ] **Step 2: Render `PitchControl` next to `SpeedControl`**

In `LoopPanel.tsx`, immediately after the closing `/>` of the `<SpeedControl ... />` element (currently ending on line 244), insert:

```tsx
            <PitchControl
              settings={pitchSettings}
              enabled={pitchEnabled}
              available={pitchAvailable}
              disabled={!enabled}
              container={loopsContainer}
              onChange={onPitchChange}
              onToggleEnabled={onTogglePitch}
              onReset={onResetPitch}
            />
```

- [ ] **Step 3: Import the pitch modules in `pageUi.tsx`**

In `entrypoints/content/pageUi.tsx`, add near the other feature imports (e.g. after the `LoopPanel` import on line 16):

```ts
import { createPitchGraph } from "../../features/pitch/pitchGraph";
import {
  DEFAULT_PITCH_SETTINGS,
  getPitchEnabled,
  loadPitchSettings,
  savePitchSettings,
  setPitchEnabled,
  type PitchSettings
} from "../../features/persistence/pitchStore";
```

- [ ] **Step 4: Add pitch state + graph inside `mountPageUi`**

In `pageUi.tsx`, after the saved-loops state block (after `let savedVideos: SavedVideo[] = [];`, ~line 121), add:

```ts
  // Pitch shift: independent of the loop. The graph taps the element lazily on
  // first engage; settings persist per video.
  let pitchSettings: PitchSettings = DEFAULT_PITCH_SETTINGS;
  let pitchEnabled = false;
  const pitchGraph = createPitchGraph(video);
  let pitchAvailable = pitchGraph.isAvailable();
```

- [ ] **Step 5: Add pitch handlers**

In `pageUi.tsx`, right after `resetSpeed` (after its closing `};`, ~line 273), add:

```ts
  // Push current pitch state into the graph and reflect availability.
  const applyPitch = () => {
    pitchGraph.setSettings(pitchSettings);
    pitchGraph.setEnabled(pitchEnabled);
    pitchAvailable = pitchGraph.isAvailable();
  };

  const setPitch = (next: PitchSettings) => {
    pitchSettings = next;
    // Dialling in an offset auto-engages, so dragging "just works" without
    // first flipping the switch.
    if (!pitchEnabled && (next.semitones !== 0 || next.cents !== 0)) {
      pitchEnabled = true;
      void setPitchEnabled(true);
    }
    applyPitch();
    if (videoId != null) void savePitchSettings(videoId, pitchSettings);
    render();
  };

  const togglePitch = () => {
    pitchEnabled = !pitchEnabled;
    void setPitchEnabled(pitchEnabled);
    applyPitch();
    render();
  };

  const resetPitch = () => {
    pitchSettings = DEFAULT_PITCH_SETTINGS;
    applyPitch();
    if (videoId != null) void savePitchSettings(videoId, pitchSettings);
    render();
  };

  // Load per-video pitch + global enabled flag, then apply. Same async race
  // guard as loadForVideo (videoId can change mid-await on SPA navigation).
  const loadPitchForVideo = async () => {
    const id = videoId;
    const en = await getPitchEnabled();
    if (videoId !== id) return;
    const s = id != null ? await loadPitchSettings(id) : DEFAULT_PITCH_SETTINGS;
    if (videoId !== id) return;
    pitchEnabled = en;
    pitchSettings = s;
    applyPitch();
    render();
  };
```

- [ ] **Step 6: Pass pitch props to `LoopPanel` in `render()`**

In `pageUi.tsx` `render()`, in the `<LoopPanel ... />` element, after `onResetSpeed={resetSpeed}` (line 481), add:

```tsx
          pitchSettings={pitchSettings}
          pitchEnabled={pitchEnabled}
          pitchAvailable={pitchAvailable}
          onPitchChange={setPitch}
          onTogglePitch={togglePitch}
          onResetPitch={resetPitch}
```

- [ ] **Step 7: Load pitch on mount and on navigation**

In `pageUi.tsx`, after the mount-time `void loadForVideo();` (line 661), add:

```ts
  void loadPitchForVideo();
```

In `onNavigate`, after the existing `void loadForVideo();` (line 644), add:

```ts
    void loadPitchForVideo();
```

- [ ] **Step 8: Dispose the graph on teardown**

In `pageUi.tsx` `stop()`, after the last `document.removeEventListener(... keyHandlers.onKeyUp ...)` line (line 679), add:

```ts
      pitchGraph.dispose();
```

- [ ] **Step 9: Typecheck, test, build**

Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm test`
Expected: all suites PASS (existing + new pitch suites).
Run: `pnpm build`
Expected: build succeeds; `soundtouchjs` is bundled into the content script with no manifest warnings.

- [ ] **Step 10: Commit**

```bash
git add entrypoints/content/pageUi.tsx features/player-overlay/LoopPanel.tsx
git commit -m "feat(pitch): wire pitch control into the player overlay"
```

---

### Task 7: End-to-end manual verification

No code. Load the unpacked build in Chrome and verify on a real video. **Do not use Rick Astley** — use Tame Impala — *The Less I Know The Better* (`watch?v=2SUwOgmvzK4`) or similar.

- [ ] **Step 1: Build + load**

Run: `pnpm dev` (or load `.output/chrome-mv3` via `chrome://extensions` → Load unpacked).

- [ ] **Step 2: Functional checks**

- [ ] Enable the loop panel; the pitch pill appears next to the speed pill, reading `0 st`.
- [ ] Drag the pill up → reads `+3` (etc.); audio pitches **up**, tempo unchanged.
- [ ] Drag down → pitches **down**. The volume stays steady (no pumping — the spike's bug is gone).
- [ ] Click the pill → popover opens; the fine slider trims cents; **On/Off** bypasses (audio returns to original, transparent); **Reset** returns to `0`.
- [ ] Change **speed** while pitched: tempo changes, the pitch offset is preserved (independent).
- [ ] Set `0` / Off → audio is bit-transparent (no audible coloration).

- [ ] **Step 3: Persistence + navigation checks**

- [ ] Set a transpose, reload the page → it is restored.
- [ ] Navigate to another video → its own pitch (or default) loads; the first video's setting is untouched.
- [ ] A video you never pitched plays with an untouched audio path.

- [ ] **Step 4: Record the result**

Note any artifacts at extreme settings (±10–12). If the main-thread ScriptProcessor glitches under load, that motivates the Task 8 worklet upgrade. Commit nothing unless a fix is needed.

---

### Task 8 (v2 enhancement — plan separately after v1 ships): AudioWorklet engine

**Do not start until v1 (Tasks 1–7) is merged and the CSP gate below is resolved.** This removes main-thread ScriptProcessor glitches by moving the SoundTouch core off-thread. It is behind the existing `PitchEngine` interface, so no UI/store/graph changes are needed — only `createPitchEngine` gains a worklet path with the ScriptProcessor as fallback.

- [ ] **CSP gate experiment.** In the content script on a YouTube watch page, attempt `audioContext.audioWorklet.addModule(browser.runtime.getURL("pitch-worklet.js"))` with a trivial pass-through `AudioWorkletProcessor` emitted as a web-accessible resource (`web_accessible_resources` in `wxt.config.ts`). Confirm it resolves (the spike proved `blob:`/`data:` are blocked; this tests the extension-origin URL).
  - If it loads → proceed.
  - If it is blocked → stop; v1's ScriptProcessor remains the engine; record the finding.
- [ ] **Bundle the worklet.** Configure WXT/Vite to emit a worklet module that bundles the `soundtouchjs` `SoundTouch` core. The processor runs the same push loop on `process(inputs, outputs)` (interleave `inputs[0]`, `putSamples`/`process`/`receiveSamples`, de-interleave to `outputs[0]`, zero-fill underflow). Pitch ratio arrives via `port.postMessage` or an `AudioParam`.
- [ ] **Add `createWorkletEngine(ctx)`** in `pitchEngine.ts` returning a `PitchEngine` whose `node` is the `AudioWorkletNode`; make `createPitchEngine` try the worklet first and fall back to `createScriptProcessorEngine` on any rejection.
- [ ] **Manual A/B** the two engines for quality and glitch-resistance under CPU load.

This task gets its own plan once the CSP gate result is known (the implementation forks on it).

---

## Self-Review

**Spec coverage:**
- Independent pitch (no speed change) → Tasks 3 (engine), 4 (`preservesPitch=true`, ratio), 6 (speed handlers untouched). ✓
- Range ±12 semis + ±50¢, ratio formula → Task 1. ✓
- Per-video persistence + global flag, best-effort → Task 2. ✓
- SoundTouch push-model engine (ScriptProcessor v1) → Task 3. ✓
- Lazy/irreversible tap, transparent bypass, never-break-audio → Task 4. ✓
- Scrub-pill + popover UI, mirrors `SpeedControl` → Task 5. ✓
- Wiring (instantiate, load on mount + nav, persist, dispose, render) → Task 6. ✓
- E2E listening / speed-independence / persistence checks (no Rick Astley) → Task 7. ✓
- AudioWorklet v2 + CSP gate → Task 8. ✓
- Licensing (LGPL-2.1 confirm) → Task 3 gate + Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output. Task 8 is intentionally a future enhancement with an experiment gate, not a v1 placeholder. ✓

**Type consistency:** `PitchSettings { semitones, cents }` used identically across Tasks 1–6. `PitchEngine { node, setRatio, dispose }` and `PitchGraph { setEnabled, setSettings, isAvailable, dispose }` consistent between definition (Tasks 3/4) and consumption (Tasks 4/6). `createScriptProcessorEngine(ctx, createSoundTouch?)`, `createPitchEngine(ctx)`, `createPitchGraph(video, deps?)` signatures match across producer and caller. `pitchRatio`/`isZeroPitch`/`semitonesFromDrag`/`clampCents`/`formatPitch` names match their definitions in Task 1. ✓
