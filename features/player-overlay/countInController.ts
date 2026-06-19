import type { CountInPlayer } from "./countInAudio";
import type { CountOffPlan } from "../playback/countOff";

export type CountInVideo = {
  pause(): void;
  play(): unknown;
  paused: boolean;
};

export type CountInController = {
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

  return {
    onWrap() {
      if (counting || !deps.isEnabled()) return;
      const plan = deps.getPlan();
      const ok = deps.player.play(plan, {
        onBeat: deps.onBeat,
        onDone: finish
      });
      if (!ok) return; // audio unavailable — leave the normal loop alone
      counting = true;
      deps.onCountStart?.();
      deps.video.pause();
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
