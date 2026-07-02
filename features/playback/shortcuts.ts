import type { LoopSegment } from "./types";
import { NUDGE_SECONDS } from "./reducer";

export type LoopKeyDeps = {
  video: HTMLVideoElement;
  // Region the keys act on: the zoom sub-region when zoomed, else the main
  // loop. null means there is nothing to act on.
  getSegment: () => LoopSegment | null;
  // Whether the loop is currently on. Keys are inert when false.
  isActive: () => boolean;
  // Clears a prior one-shot completion so the segment replays from the top.
  resetOneShot: () => void;
  // Move the active region (zoom sub-region when zoomed, else the main loop) by
  // `delta` seconds, length preserved. The caller picks the clamp bounds.
  moveActiveWindow: (delta: number) => void;
  // Optional: request a count-in for a manual Restart. Returns true if a count
  // started (it will play on the downbeat, so the shortcut must NOT also play);
  // false/absent means play immediately as usual.
  startCountIn?: () => boolean;
};

export type LoopKeyHandlers = {
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
};

const RESTART_KEY = "a";
const SNAP_BACK_KEY = "s";
const PUSH_TO_HEAR_KEY = "d";
const HANDLED_KEYS = new Set([RESTART_KEY, SNAP_BACK_KEY, PUSH_TO_HEAR_KEY]);

// Bracket keys move the window; matched by event.code so Shift (which turns
// "[" into "{") doesn't change the match.
const STEP_CODES = new Set(["BracketLeft", "BracketRight"]);

// Don't steal keys while the user is typing (e.g. the YouTube search box).
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function createLoopKeyHandlers(deps: LoopKeyDeps): LoopKeyHandlers {
  // Tracks which of our keys are physically down, so OS auto-repeat keydowns
  // and duplicate keyups are ignored.
  const held = new Set<string>();

  // Runs the shared gate. Returns the segment to act on, or null if the event
  // should be ignored. Calls preventDefault/stopPropagation only when it decides
  // to handle the key.
  const resolveEvent = (event: KeyboardEvent): LoopSegment | null => {
    if (isTypingTarget(event.target)) return null;
    if (!deps.isActive()) return null;
    const segment = deps.getSegment();
    if (segment == null) return null;
    event.preventDefault();
    event.stopPropagation();
    return segment;
  };

  // Returns true if the event was a window step/nudge key (handled or
  // deliberately ignored by the gate), so onKeyDown can stop.
  const handleStepKey = (event: KeyboardEvent): boolean => {
    if (!STEP_CODES.has(event.code)) return false;
    const segment = resolveEvent(event);
    if (segment == null) return true;
    const dir = event.code === "BracketRight" ? 1 : -1;
    const len = segment.end - segment.start;
    deps.moveActiveWindow(event.shiftKey ? dir * len : dir * NUDGE_SECONDS);
    return true;
  };

  // Run the pressed shortcut's action. Restart and snap-back replay from the
  // region start; push-to-hear plays from the playhead. Restart additionally
  // hands off to count-in (which then owns the play) when one is requested.
  const applyPress = (key: string, segment: LoopSegment) => {
    switch (key) {
      case RESTART_KEY:
        deps.video.currentTime = segment.start;
        // With count-in on, the count owns the play (it resumes on the
        // downbeat). Only play here when no count started.
        if (deps.startCountIn?.()) return;
        void deps.video.play();
        return;
      case SNAP_BACK_KEY:
        deps.video.currentTime = segment.start;
        void deps.video.play();
        return;
      case PUSH_TO_HEAR_KEY:
        void deps.video.play();
        return;
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (handleStepKey(event)) return;

    const key = event.key.toLowerCase();
    if (!HANDLED_KEYS.has(key)) return;

    // Ignore OS auto-repeat, and a duplicate keydown with no intervening keyup
    // (e.g. focus loss swallowed the keyup). Bail before resolveEvent so these
    // events aren't consumed when we take no action.
    if (event.repeat || held.has(key)) return;

    const segment = resolveEvent(event);
    if (segment == null) return;
    held.add(key);

    // Every shortcut here starts a fresh play, so clear any prior one-shot
    // completion. Otherwise enforceSegmentEnd treats reaching the end as
    // "resuming a finished one-shot" and jumps back to the start (a spurious
    // repeat) instead of stopping.
    deps.resetOneShot();
    applyPress(key, segment);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!HANDLED_KEYS.has(key)) return;
    // Always clear held-state, even if gating now blocks the action, so a key
    // can't get stuck "held" across a loop toggle.
    const wasHeld = held.delete(key);
    // Untracked keyup (we never acted on its keydown): bail before resolveEvent
    // so we don't consume an event we aren't handling.
    if (!wasHeld) return;

    const segment = resolveEvent(event);
    if (segment == null) return;

    switch (key) {
      case SNAP_BACK_KEY:
        deps.video.pause();
        deps.video.currentTime = segment.start;
        break;
      case PUSH_TO_HEAR_KEY:
        deps.video.pause();
        break;
      // RESTART_KEY is a tap — no release behaviour.
    }
  };

  return { onKeyDown, onKeyUp };
}
