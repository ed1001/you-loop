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
    expect(createMediaElementSource).not.toHaveBeenCalled();
    graph.setSettings({ semitones: 3, cents: 0 });
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
