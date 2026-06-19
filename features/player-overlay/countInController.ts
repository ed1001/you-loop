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
  /** Interrupt any running count and resume playback. */
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

  const start = (): boolean => {
    if (counting || !deps.isEnabled()) return false;
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
    start,
    onWrap() {
      start();
    },
    cancel() {
      if (!counting) return;
      counting = false;
      deps.player.cancel();
      deps.onCountEnd?.();
      if (deps.video.paused) void deps.video.play();
    },
    isCounting: () => counting
  };
}
