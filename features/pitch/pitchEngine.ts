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
