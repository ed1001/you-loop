import type { CountOffPlan, ScheduledBeat } from "../playback/countOff";

export type AudioContextFactory = () => AudioContext;

export type CountInPlayer = {
  /** Create/resume the context. Call from a user gesture to satisfy autoplay. */
  unlock(): void;
  /** Schedule the plan. Returns false (and schedules nothing) if audio is
      unavailable, so the caller can fall back to a normal loop. */
  play(
    plan: CountOffPlan,
    hooks: { onBeat?: (index: number) => void; onDone?: () => void }
  ): boolean;
  cancel(): void;
  /** Clear timers and close the AudioContext. Safe to call multiple times. */
  dispose(): void;
};

const GAIN = 0.3;
const ACCENT_GAIN = 0.36;

function defaultFactory(): AudioContext {
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (Ctor == null) throw new Error("Web Audio unavailable");
  return new Ctor();
}

export function createCountInPlayer(
  factory: AudioContextFactory = defaultFactory
): CountInPlayer {
  let ctx: AudioContext | null = null;
  let timers: number[] = [];

  const ensure = (): AudioContext | null => {
    try {
      if (ctx == null) ctx = factory();
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };

  const scheduleBeatAudio = (c: AudioContext, beat: ScheduledBeat, base: number) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = beat.freqHz;
    osc.connect(g);
    g.connect(c.destination);
    const t = base + beat.timeSec;
    const peak = beat.role === "accent" ? ACCENT_GAIN : GAIN;
    // Every beat is a short pulse: quick attack then exponential decay.
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + beat.durSec);
    osc.start(t);
    osc.stop(t + beat.durSec + 0.03);
  };

  const clearTimers = () => {
    for (const id of timers) window.clearTimeout(id);
    timers = [];
  };

  return {
    unlock() {
      ensure();
    },
    play(plan, hooks) {
      clearTimers();
      const c = ensure();
      if (c == null || c.state !== "running") return false;
      const base = c.currentTime + 0.06;
      for (const beat of plan.beats) {
        scheduleBeatAudio(c, beat, base);
        if (hooks.onBeat != null) {
          timers.push(
            window.setTimeout(() => hooks.onBeat!(beat.index), beat.timeSec * 1000)
          );
        }
      }
      if (hooks.onDone != null) {
        timers.push(window.setTimeout(() => hooks.onDone!(), plan.totalSec * 1000));
      }
      return true;
    },
    cancel() {
      clearTimers();
    },
    dispose() {
      clearTimers();
      if (ctx != null) {
        try {
          // close() can throw synchronously or reject; cover both so a
          // teardown never surfaces an unhandled rejection.
          void Promise.resolve(ctx.close()).catch(() => {});
        } catch {
          // ignore — close() threw synchronously in this environment
        }
        ctx = null;
      }
    }
  };
}
