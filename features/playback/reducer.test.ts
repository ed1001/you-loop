import { describe, expect, it } from "vitest";
import {
  clampPlaybackRate,
  createInitialPlaybackState,
  playbackReducer
} from "./reducer";

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
    expect(clampPlaybackRate(1.37)).toBe(1.25);
    expect(clampPlaybackRate(9)).toBe(3);
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
