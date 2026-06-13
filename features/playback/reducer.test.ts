import { describe, expect, it } from "vitest";
import {
  clampPlaybackRate,
  createInitialPlaybackState,
  defaultLoopSegment,
  playbackReducer
} from "./reducer";

describe("defaultLoopSegment", () => {
  it("spans the whole timeline", () => {
    expect(defaultLoopSegment(100)).toEqual({ start: 0, end: 100 });
  });

  it("starts at zero for any duration", () => {
    expect(defaultLoopSegment(10)).toEqual({ start: 0, end: 10 });
  });

  it("normalizes a zero-duration video to a minimum-length segment", () => {
    const seg = defaultLoopSegment(0);
    expect(seg.start).toBe(0);
    expect(seg.end).toBeCloseTo(0.1, 5);
  });
});

describe("playback reducer", () => {
  it("sets a valid loop segment", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "setLoopSegment",
      segment: { start: 5, end: 8 }
    });

    expect(state.loopSegment).toEqual({ start: 5, end: 8 });
  });

  it("clamps crossing handles to minimum duration", () => {
    const state = playbackReducer(
      { ...createInitialPlaybackState(), loopSegment: { start: 5, end: 8 } },
      { type: "setLoopSegment", segment: { start: 7, end: 7.02 } }
    );

    expect(state.loopSegment).toEqual({ start: 7, end: 7.1 });
  });

  it("clears loop segment", () => {
    const state = playbackReducer(
      { ...createInitialPlaybackState(), loopSegment: { start: 1, end: 2 } },
      { type: "clearLoop" }
    );

    expect(state.loopSegment).toBeNull();
  });

  it("clamps playback rate", () => {
    expect(clampPlaybackRate(0)).toBe(0.25);
    expect(clampPlaybackRate(1.37)).toBe(1.35);
    expect(clampPlaybackRate(9)).toBe(3);
  });

  it("snaps playback rate to the 0.05 grid without float drift", () => {
    expect(clampPlaybackRate(0.1 + 0.2)).toBe(0.3);
    expect(clampPlaybackRate(1 + 0.05 * 3)).toBe(1.15);
    expect(clampPlaybackRate(2.999)).toBe(3);
  });

  it("sets play mode", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "setPlayMode",
      mode: "one-shot"
    });

    expect(state.playMode).toBe("one-shot");
  });

  it("toggles enabled state", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "setEnabled",
      enabled: false
    });

    expect(state.enabled).toBe(false);
  });
});
