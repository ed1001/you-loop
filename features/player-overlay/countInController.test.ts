import { describe, expect, it, vi } from "vitest";
import { createCountInController } from "./countInController";
import { buildCountOff } from "../playback/countOff";

function setup(opts: { enabled?: boolean; audioOk?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const audioOk = opts.audioOk ?? true;
  const video = { paused: false, pause: vi.fn(() => { video.paused = true; }), play: vi.fn(() => { video.paused = false; }) };
  let captured: { onDone?: () => void } = {};
  const player = {
    unlock: vi.fn(),
    play: vi.fn((_plan, hooks) => {
      captured = hooks;
      return audioOk;
    }),
    cancel: vi.fn(),
    dispose: vi.fn()
  };
  const controller = createCountInController({
    video,
    player,
    isEnabled: () => enabled,
    getPlan: () => buildCountOff({ meter: { beatsPerBar: 4, noteValue: 4 }, bars: 1, bpm: 120 })
  });
  return { controller, video, player, fireDone: () => captured.onDone?.() };
}

describe("countInController", () => {
  it("pauses, then resumes on done", () => {
    const { controller, video, fireDone } = setup();
    controller.onWrap();
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(controller.isCounting()).toBe(true);
    fireDone();
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(controller.isCounting()).toBe(false);
  });

  it("does nothing when disabled", () => {
    const { controller, video, player } = setup({ enabled: false });
    controller.onWrap();
    expect(player.play).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("start() returns true and pauses when a count begins", () => {
    const { controller, video } = setup();
    expect(controller.start()).toBe(true);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(controller.isCounting()).toBe(true);
    // resume-on-done is covered by the onWrap test (shared code path).
  });

  it("start() returns false when disabled", () => {
    const { controller, video } = setup({ enabled: false });
    expect(controller.start()).toBe(false);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("start() returns false when audio is unavailable", () => {
    const { controller } = setup({ audioOk: false });
    expect(controller.start()).toBe(false);
  });

  it("ignores a second wrap while counting", () => {
    const { controller, player } = setup();
    controller.onWrap();
    controller.onWrap();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("does not pause when audio is unavailable", () => {
    const { controller, video } = setup({ audioOk: false });
    controller.onWrap();
    expect(video.pause).not.toHaveBeenCalled();
    expect(controller.isCounting()).toBe(false);
  });

  it("cancel stops the player and resumes a paused video", () => {
    const { controller, video, player } = setup();
    controller.onWrap();
    controller.cancel();
    expect(player.cancel).toHaveBeenCalled();
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(controller.isCounting()).toBe(false);
  });
});
