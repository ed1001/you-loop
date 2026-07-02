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
