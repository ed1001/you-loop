import { createPitchEngine, type PitchEngine } from "./pitchEngine";
import { isZeroPitch, pitchRatio } from "./pitchScrub";
import type { PitchSettings } from "../persistence/pitchStore";

export interface PitchGraph {
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
  let settings: PitchSettings = { semitones: 0, cents: 0 };
  let available = true;
  let tapping = false;
  let tapped = false;
  let failed = false;

  let ctx: AudioContext | null = null;
  let inputGain: GainNode | null = null;
  let engine: PitchEngine | null = null;
  let branch: "none" | "direct" | "pitch" = "none";

  // True when the user wants audible processing right now. A zero offset is
  // silence-transparent by construction, so non-zero settings ARE the on
  // switch — there is no separate enabled flag.
  const wantsPitch = () => !isZeroPitch(settings) && !failed;

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
