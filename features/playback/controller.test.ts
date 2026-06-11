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
});
