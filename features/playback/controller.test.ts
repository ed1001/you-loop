import { describe, expect, it, vi } from "vitest";
import { applyPlaybackState, enforceSegmentEnd } from "./controller";
import { createInitialPlaybackState } from "./reducer";

function video(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    currentTime: 0,
    playbackRate: 1,
    paused: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides
  } as unknown as HTMLVideoElement;
}

describe("playback controller", () => {
  it("applies playback rate", () => {
    const element = video();
    applyPlaybackState(element, {
      ...createInitialPlaybackState(),
      playbackRate: 1.5
    });
    expect(element.playbackRate).toBe(1.5);
  });

  it("loops from end to start", () => {
    const element = video({ currentTime: 8.01 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "loop"
    });

    expect(element.currentTime).toBe(5);
    expect(result.oneShotCompleted).toBe(false);
  });

  it("snaps the playhead into the segment from before the start", () => {
    const element = video({ currentTime: 2 });
    enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "loop"
    });

    expect(element.currentTime).toBe(5);
  });

  it("leaves the playhead alone when loop is disabled", () => {
    const element = video({ currentTime: 8.01 });
    enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: false,
      loopSegment: { start: 5, end: 8 },
      playMode: "loop"
    });

    expect(element.currentTime).toBe(8.01);
  });

  it("pauses one-shot at segment end", () => {
    const element = video({ currentTime: 8.01 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "one-shot"
    });

    expect(element.pause).toHaveBeenCalled();
    expect(element.currentTime).toBe(8);
    expect(result.oneShotCompleted).toBe(true);
  });

  it("snaps one-shot into the segment from before the start", () => {
    const element = video({ currentTime: 2 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "one-shot"
    });

    expect(element.currentTime).toBe(5);
    expect(element.pause).not.toHaveBeenCalled();
    expect(result.oneShotCompleted).toBe(false);
  });

  it("snaps to the start when scrubbed before the region, even once completed", () => {
    const element = video({ currentTime: 2 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "one-shot",
      oneShotCompleted: true
    });

    expect(element.currentTime).toBe(5);
    expect(result.oneShotCompleted).toBe(false);
  });

  it("restarts a completed one-shot when playback resumes past the end", () => {
    const element = video({ currentTime: 8.01, paused: false });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "one-shot",
      oneShotCompleted: true
    });

    expect(element.currentTime).toBe(5);
    expect(element.pause).not.toHaveBeenCalled();
    expect(result.oneShotCompleted).toBe(false);
  });

  it("keeps a completed one-shot paused at the end while still paused", () => {
    const element = video({ currentTime: 8.01, paused: true });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "one-shot",
      oneShotCompleted: true
    });

    expect(element.currentTime).toBe(8);
    expect(element.pause).toHaveBeenCalled();
    expect(result.oneShotCompleted).toBe(true);
  });

  // `sought` drives the caller's latch that stops a wrap into an unbuffered
  // point from re-firing every frame (the multi-second freeze on tight loops).
  it("reports sought=true when it wraps from the end", () => {
    const element = video({ currentTime: 8.01 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "loop"
    });

    expect(result.sought).toBe(true);
  });

  // Regression: seeking to a fractional start lands a sliver below it, so a
  // strict `currentTime < start` re-fired every frame after the wrap (measured
  // up to 4 seeks per wrap, the start-cursor stutter). A sub-frame undershoot
  // must read as "at the start", not "before the region".
  it("does not re-seek when the playhead is a sliver below a fractional start", () => {
    const element = video({ currentTime: 85.224 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 85.2241, end: 91.616 },
      playMode: "loop"
    });

    expect(element.currentTime).toBe(85.224);
    expect(result.sought).toBe(false);
  });

  it("still snaps in when the playhead is clearly before the start", () => {
    const element = video({ currentTime: 84.5 });
    enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 85.2241, end: 91.616 },
      playMode: "loop"
    });

    expect(element.currentTime).toBe(85.2241);
  });

  it("reports sought=false while the playhead is inside the segment", () => {
    const element = video({ currentTime: 6 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: true,
      loopSegment: { start: 5, end: 8 },
      playMode: "loop"
    });

    expect(element.currentTime).toBe(6);
    expect(result.sought).toBe(false);
  });

  it("reports sought=false when loop is disabled", () => {
    const element = video({ currentTime: 8.01 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopEnabled: false,
      loopSegment: { start: 5, end: 8 },
      playMode: "loop"
    });

    expect(result.sought).toBe(false);
  });
});

function loopState(over: Partial<typeof createInitialPlaybackState> = {}) {
  return {
    ...createInitialPlaybackState(),
    enabled: true,
    loopEnabled: true,
    loopSegment: { start: 10, end: 20 },
    playMode: "loop" as const,
    ...over
  };
}

describe("enforceSegmentEnd wrapped flag", () => {
  it("sets wrapped on the end→start wrap", () => {
    const element = video({ currentTime: 21 });
    const r = enforceSegmentEnd(element, loopState());
    expect(r.sought).toBe(true);
    expect(r.wrapped).toBe(true);
  });

  it("does not set wrapped on the front-edge snap", () => {
    const element = video({ currentTime: 5 });
    const r = enforceSegmentEnd(element, loopState());
    expect(r.sought).toBe(true);
    expect(r.wrapped).toBe(false);
  });

  it("does not set wrapped when inside the loop", () => {
    const element = video({ currentTime: 15 });
    const r = enforceSegmentEnd(element, loopState());
    expect(r.sought).toBe(false);
    expect(r.wrapped).toBe(false);
  });
});
