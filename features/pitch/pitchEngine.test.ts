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
