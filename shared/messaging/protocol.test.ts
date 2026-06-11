import { describe, expect, it } from "vitest";
import { createInitialBackgroundState, reduceBackgroundState } from "./protocol";

describe("messaging protocol tab state", () => {
  it("stores per-tab playback state", () => {
    const state = reduceBackgroundState(
      createInitialBackgroundState(),
      {
        type: "stateChanged",
        state: {
          enabled: true,
          loopEnabled: true,
          loopSegment: { start: 1, end: 2 },
          playMode: "loop",
          playbackRate: 1,
          oneShotCompleted: false
        }
      },
      7
    );

    expect(state.tabs.get(7)?.loopSegment).toEqual({ start: 1, end: 2 });
  });

  it("sets global enabled", () => {
    const state = reduceBackgroundState(createInitialBackgroundState(), {
      type: "setEnabled",
      enabled: false
    });

    expect(state.enabled).toBe(false);
  });
});
