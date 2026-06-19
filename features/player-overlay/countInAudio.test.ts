import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCountInPlayer } from "./countInAudio";
import { buildCountOff } from "../playback/countOff";

declare const AudioContext: any;

function fakeContext() {
  const oscillators: any[] = [];
  const ctx = {
    state: "running",
    currentTime: 0,
    resume: vi.fn(),
    close: vi.fn(),
    destination: {},
    createOscillator() {
      const osc = {
        frequency: { value: 0 },
        type: "sine",
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      };
    }
  };
  return { ctx, oscillators };
}

describe("createCountInPlayer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("schedules one oscillator per beat", () => {
    const { ctx, oscillators } = fakeContext();
    const player = createCountInPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    const plan = buildCountOff({ meter: { beatsPerBar: 4, noteValue: 4 }, bars: 1, bpm: 120 });
    const ok = player.play(plan, {});
    expect(ok).toBe(true);
    // 4/4 single bar = 4 pulses (no rest)
    expect(oscillators).toHaveLength(4);
  });

  it("cancel stops scheduled oscillators so a restart does not overlap", () => {
    const { ctx, oscillators } = fakeContext();
    const player = createCountInPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    const plan = buildCountOff({ meter: { beatsPerBar: 4, noteValue: 4 }, bars: 1, bpm: 120 });
    player.play(plan, {});
    player.cancel();
    expect(oscillators).toHaveLength(4);
    for (const osc of oscillators) expect(osc.stop).toHaveBeenCalled();
  });

  it("fires onBeat per beat and onDone at totalSec", () => {
    const { ctx } = fakeContext();
    const player = createCountInPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    const onBeat = vi.fn();
    const onDone = vi.fn();
    const plan = buildCountOff({ meter: { beatsPerBar: 4, noteValue: 4 }, bars: 1, bpm: 120 });
    player.play(plan, { onBeat, onDone });
    vi.advanceTimersByTime(2000); // totalSec = 2s
    expect(onBeat).toHaveBeenCalledTimes(4);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("returns false and schedules nothing when the context is not running", () => {
    const { ctx, oscillators } = fakeContext();
    ctx.state = "suspended";
    const player = createCountInPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    ctx.state = "suspended"; // resume did not take in the fake
    const plan = buildCountOff({ meter: { beatsPerBar: 4, noteValue: 4 }, bars: 1, bpm: 120 });
    const onDone = vi.fn();
    expect(player.play(plan, { onDone })).toBe(false);
    expect(oscillators).toHaveLength(0);
  });

  it("cancel clears pending onDone", () => {
    const { ctx } = fakeContext();
    const player = createCountInPlayer(() => ctx as unknown as AudioContext);
    player.unlock();
    const onDone = vi.fn();
    const plan = buildCountOff({ meter: { beatsPerBar: 4, noteValue: 4 }, bars: 1, bpm: 120 });
    player.play(plan, { onDone });
    player.cancel();
    vi.advanceTimersByTime(3000);
    expect(onDone).not.toHaveBeenCalled();
  });
});
