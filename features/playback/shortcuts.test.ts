import { describe, expect, it, vi } from "vitest";
import { createLoopKeyHandlers, type LoopKeyDeps } from "./shortcuts";
import type { LoopSegment } from "./types";
import { NUDGE_SECONDS } from "./reducer";

function video(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    currentTime: 6,
    paused: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides
  } as unknown as HTMLVideoElement;
}

function setup(depsOverrides: Partial<LoopKeyDeps> = {}) {
  const vid = video();
  const resetOneShot = vi.fn();
  const moveActiveWindow = vi.fn();
  const segment: LoopSegment = { start: 5, end: 8 };
  const deps: LoopKeyDeps = {
    video: vid,
    getSegment: () => segment,
    isActive: () => true,
    resetOneShot,
    moveActiveWindow,
    ...depsOverrides
  };
  return { vid, resetOneShot, moveActiveWindow, handlers: createLoopKeyHandlers(deps) };
}

function keyEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key,
    code: "",
    shiftKey: false,
    repeat: false,
    target: document.body,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides
  } as unknown as KeyboardEvent;
}

describe("loop key handlers", () => {
  it("restart (a) seeks to start, plays, and resets one-shot", () => {
    const { vid, resetOneShot, handlers } = setup();
    handlers.onKeyDown(keyEvent("a"));
    expect(resetOneShot).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(5);
    expect(vid.play).toHaveBeenCalledTimes(1);
  });

  it("snap-back (s) plays from start on press, pauses+rewinds on release", () => {
    const { vid, resetOneShot, handlers } = setup();
    handlers.onKeyDown(keyEvent("s"));
    expect(resetOneShot).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(5);
    expect(vid.play).toHaveBeenCalledTimes(1);

    vid.currentTime = 7; // playback advanced
    handlers.onKeyUp(keyEvent("s"));
    expect(vid.pause).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(5);
  });

  it("push-to-hear (d) plays from current position, pauses in place on release", () => {
    const { vid, resetOneShot, handlers } = setup();
    handlers.onKeyDown(keyEvent("d"));
    expect(vid.play).toHaveBeenCalledTimes(1);
    // Clears a stale one-shot completion so this fresh play isn't misread as
    // resuming a finished one-shot (which would jump back to the start).
    expect(resetOneShot).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(6); // unchanged

    vid.currentTime = 7;
    handlers.onKeyUp(keyEvent("d"));
    expect(vid.pause).toHaveBeenCalledTimes(1);
    expect(vid.currentTime).toBe(7); // stays put
  });

  it("ignores auto-repeat keydown while held, without consuming the event", () => {
    const { vid, handlers } = setup();
    handlers.onKeyDown(keyEvent("d"));
    const repeat = keyEvent("d", { repeat: true });
    handlers.onKeyDown(repeat);
    expect(vid.play).toHaveBeenCalledTimes(1);
    // Auto-repeat is ignored AND passed through (not preventDefault-ed).
    expect(repeat.preventDefault).not.toHaveBeenCalled();
    handlers.onKeyUp(keyEvent("d"));
    expect(vid.pause).toHaveBeenCalledTimes(1);
  });

  it("does not act on or consume a keyup whose keydown was never tracked", () => {
    const { vid, handlers } = setup();
    const event = keyEvent("s");
    handlers.onKeyUp(event);
    expect(vid.pause).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("no-ops when the loop is not active", () => {
    const { vid, handlers } = setup({ isActive: () => false });
    const event = keyEvent("a");
    handlers.onKeyDown(event);
    expect(vid.play).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("no-ops when there is no segment", () => {
    const { vid, handlers } = setup({ getSegment: () => null });
    const event = keyEvent("a");
    handlers.onKeyDown(event);
    expect(vid.play).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("no-ops when typing in an input", () => {
    const { vid, handlers } = setup();
    const input = document.createElement("input");
    const event = keyEvent("a", { target: input });
    handlers.onKeyDown(event);
    expect(vid.play).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("passes unbound keys through without intercepting", () => {
    const { vid, handlers } = setup();
    const event = keyEvent("z");
    handlers.onKeyDown(event);
    expect(vid.play).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("window step/nudge keys", () => {
  it("] nudges the window forward by NUDGE_SECONDS", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    expect(moveActiveWindow).toHaveBeenCalledWith(NUDGE_SECONDS);
  });

  it("[ nudges the window backward by NUDGE_SECONDS", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("[", { code: "BracketLeft" }));
    expect(moveActiveWindow).toHaveBeenCalledWith(-NUDGE_SECONDS);
  });

  it("Shift+] steps forward by its own length (matched via code under shift)", () => {
    const { moveActiveWindow, handlers } = setup();
    // Shift turns the key into "}", but event.code stays BracketRight.
    // segment is {start:5,end:8} so len=3.
    handlers.onKeyDown(keyEvent("}", { code: "BracketRight", shiftKey: true }));
    expect(moveActiveWindow).toHaveBeenCalledWith(3);
  });

  it("Shift+[ steps backward by its own length", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("{", { code: "BracketLeft", shiftKey: true }));
    expect(moveActiveWindow).toHaveBeenCalledWith(-3);
  });

  it("repeats on OS auto-repeat (hold to march)", () => {
    const { moveActiveWindow, handlers } = setup();
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight", repeat: true }));
    expect(moveActiveWindow).toHaveBeenCalledTimes(2);
  });

  it("is inert when the loop is off", () => {
    const { moveActiveWindow, handlers } = setup({ isActive: () => false });
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    expect(moveActiveWindow).not.toHaveBeenCalled();
  });

  it("is inert when there is no active segment", () => {
    const { moveActiveWindow, handlers } = setup({ getSegment: () => null });
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight" }));
    expect(moveActiveWindow).not.toHaveBeenCalled();
  });

  it("ignores brackets while typing", () => {
    const { moveActiveWindow, handlers } = setup();
    const input = document.createElement("input");
    handlers.onKeyDown(keyEvent("]", { code: "BracketRight", target: input }));
    expect(moveActiveWindow).not.toHaveBeenCalled();
  });
});
