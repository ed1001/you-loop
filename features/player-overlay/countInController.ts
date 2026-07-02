import type { CountInPlayer } from "./countInAudio";
import type { CountOffPlan } from "../playback/countOff";

export type CountInVideo = {
  pause(): void;
  play(): unknown;
  paused: boolean;
};

export type CountInController = {
  /** Start a count from the current position: pause, play the count-off, and
   *  resume on the downbeat. No-op (returns false) when disabled, already
   *  counting, or audio is unavailable. Returns true when a count began, so a
   *  caller (e.g. the Restart shortcut) can skip its own immediate play. */
  start(): boolean;
  /** Call when a loop wrap (end → start) has occurred. */
  onWrap(): void;
  /** Interrupt any running count. Leaves the video paused — playback never
   *  starts mid-count; only the count completing (finish) resumes it. */
  cancel(): void;
  isCounting(): boolean;
};

export function createCountInController(deps: {
  video: CountInVideo;
  player: CountInPlayer;
  isEnabled: () => boolean;
  getPlan: () => CountOffPlan;
  onBeat?: (index: number) => void;
  onCountStart?: () => void;
  onCountEnd?: () => void;
}): CountInController {
  let counting = false;

  const finish = () => {
    if (!counting) return;
    counting = false;
    deps.onCountEnd?.();
    void deps.video.play();
  };

  // Tear down an in-flight count without resuming playback (the caller either
  // re-pauses for a fresh count, or resumes itself).
  const teardown = () => {
    if (!counting) return;
    counting = false;
    deps.player.cancel();
    deps.onCountEnd?.();
  };

  // Pause and play the count from the current position.
  const begin = (): boolean => {
    const plan = deps.getPlan();
    const ok = deps.player.play(plan, {
      onBeat: deps.onBeat,
      onDone: finish
    });
    if (!ok) return false; // audio unavailable — leave normal playback alone
    counting = true;
    deps.onCountStart?.();
    deps.video.pause();
    return true;
  };

  return {
    // Restart-capable: a fresh count interrupts one already running (e.g.
    // pressing Restart in quick succession), so the old beeps never overlap.
    start(): boolean {
      if (!deps.isEnabled()) return false;
      teardown();
      return begin();
    },
    // Never interrupts an in-flight count (rapid wraps can't stack a count).
    onWrap() {
      if (counting || !deps.isEnabled()) return;
      begin();
    },
    cancel() {
      teardown();
    },
    isCounting: () => counting
  };
}
