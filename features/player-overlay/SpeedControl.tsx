import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  PLAYBACK_RATE_STEP,
  clampPlaybackRate
} from "../playback/reducer";
import {
  TAPE_WINDOW_PX,
  rateFromDrag,
  resetProgress,
  tapeOffset,
  tapeStops,
  tapeY
} from "./speedScrub";

type Props = {
  rate: number;
  disabled: boolean;
  /** Portal host for the scrubber popover (the player element); the panel's
      cluster clips overflow, so the popover cannot live inside the pill. */
  container: HTMLElement | null;
  onRateChange: (rate: number) => void;
  onReset: () => void;
};

// Mirror of the pill's exit animation length; keeps the popover mounted long
// enough to play its sink-out.
const POP_EXIT_MS = 140;

// Quarter stops carry a printed value; the 0.05s between them are bare ticks.
const isLabeled = (stop: number) => Math.round(stop * 100) % 25 === 0;

// Keyboard slider semantics: arrows nudge a step, Page keys a quarter,
// Home/End jump to the range ends, and the reset keys snap back to 1×.
const KEY_STEPS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
  PageUp: 5,
  PageDown: -5
};

const KEY_JUMPS: Record<string, number> = {
  Home: MIN_PLAYBACK_RATE,
  End: MAX_PLAYBACK_RATE
};

const KEY_RESET = new Set(["Enter", "Backspace", "Delete"]);

// 1 → "1×", 1.05 → "1.05×".
const formatRate = (rate: number) => `${Number(rate.toFixed(2))}×`;

const swallow = (event: MouseEvent | ReactPointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function SpeedControl({
  rate,
  disabled,
  container,
  onRateChange,
  onReset
}: Props) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRate: number;
    moved: boolean;
    // Drag travel in px. With pointer lock the OS cursor is frozen and
    // clientX/Y stop moving, so travel accumulates from movementX/Y instead.
    accX: number;
    accY: number;
  } | null>(null);
  const exitTimerRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // Popover anchor, in container-local coordinates (px).
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  // 0–1 reveal of the snap-back target; ≥ 1 means release resets.
  const [armX, setArmX] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => () => window.clearTimeout(exitTimerRef.current), []);

  // Pin our overlay (and YouTube's bottom chrome) visible while scrubbing,
  // same flags the zoom timeline uses. The speed-scrub flag additionally
  // hides the cursor: the popover is the pointer during the gesture.
  const setDragLock = (on: boolean) => {
    const chip = chipRef.current;
    if (chip == null) return;
    const ui = chip.closest<HTMLElement>(".you-loop-page-ui");
    const player = chip.closest<HTMLElement>(".html5-video-player");
    if (on) {
      if (ui != null) ui.dataset.dragging = "true";
      if (player != null) {
        player.dataset.youLoopScrubbing = "true";
        player.dataset.youLoopSpeedScrub = "true";
      }
    } else {
      if (ui != null) delete ui.dataset.dragging;
      if (player != null) {
        delete player.dataset.youLoopScrubbing;
        delete player.dataset.youLoopSpeedScrub;
      }
    }
  };

  // The release of a scrub can land over any YouTube control (pause, settings,
  // the scrubber…); the browser then synthesizes a click there. Swallow the
  // next click, once, in the capture phase so the drag's release stays ours.
  const suppressNextClick = () => {
    const swallowOnce = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallowOnce, { capture: true, once: true });
    // If no click materializes (e.g. release outside the window), drop the
    // trap so it cannot eat an unrelated later click.
    window.setTimeout(() => {
      window.removeEventListener("click", swallowOnce, { capture: true });
    }, 250);
  };

  const updateAnchor = () => {
    const chip = chipRef.current;
    if (chip == null || container == null) return;
    const chipRect = chip.getBoundingClientRect();
    const hostRect = container.getBoundingClientRect();
    const left = chipRect.left + chipRect.width / 2 - hostRect.left;
    const top = chipRect.top - hostRect.top;
    setAnchor((prev) =>
      prev.left === left && prev.top === top ? prev : { left, top }
    );
  };

  const openPopover = () => {
    window.clearTimeout(exitTimerRef.current);
    setClosing(false);
    updateAnchor();
    setOpen(true);
  };

  const closePopover = () => {
    setClosing(true);
    exitTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, POP_EXIT_MS);
  };

  const endDrag = () => {
    dragRef.current = null;
    // Unpin the cursor; the browser restores it to the press point (the chip).
    if (document.pointerLockElement === chipRef.current) {
      document.exitPointerLock?.();
    }
    setArmX(0);
    setDragLock(false);
    closePopover();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    swallow(event);
    if (disabled || dragRef.current != null) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRate: rate,
      moved: false,
      accX: 0,
      accY: 0
    };
    // Capture before anything else: without it the release lands on whatever
    // YouTube control sits under the pointer. Throws on an already-released
    // (or synthetic) pointer — the drag still works, only uncaptured.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // keep the drag alive
    }
    // Pin the OS cursor for the scrub (input-scrubbing idiom): it reappears
    // exactly on the chip at release instead of wherever the drag wandered.
    // Best-effort — when unavailable/denied the clientX/Y fallback below
    // still drives the drag, with the cursor merely hidden by CSS.
    try {
      const lock = event.currentTarget.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      lock?.catch?.(() => {});
    } catch {
      // keep the drag alive
    }
    setArmX(0);
    setDragLock(true);
    openPopover();
  };

  // Fold a pointer event into the drag's accumulated travel. Locked: the
  // cursor is frozen, so integrate movementX/Y. Unlocked: absolute deltas
  // from the press point (also the test-environment path).
  const trackTravel = (
    drag: NonNullable<typeof dragRef.current>,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (document.pointerLockElement === chipRef.current) {
      drag.accX += event.movementX ?? 0;
      drag.accY += event.movementY ?? 0;
    } else {
      drag.accX = event.clientX - drag.startX;
      drag.accY = event.clientY - drag.startY;
    }
    if (Math.abs(drag.accX) > 2 || Math.abs(drag.accY) > 2) drag.moved = true;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    // pointerId filter: a second pointer (other touch, stray mouse) must not
    // steer a drag it didn't start.
    if (drag == null || event.pointerId !== drag.pointerId) return;
    swallow(event);
    // The pill animates open/closed; if the press landed mid-animation the
    // anchor measured at pointerdown is stale, so track the chip while it
    // settles.
    updateAnchor();
    trackTravel(drag, event);
    const progress = resetProgress(drag.accX);
    setArmX(progress);
    // While the reset gesture is armed the tape freezes; vertical motion
    // resumes if the user backs out of it.
    if (progress < 1) {
      const next = rateFromDrag(drag.startRate, -drag.accY);
      if (next !== rate) onRateChange(next);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    swallow(event);
    trackTravel(drag, event);
    const armed = resetProgress(drag.accX) >= 1;
    if (drag.moved) suppressNextClick();
    endDrag();
    if (armed && rate !== 1) {
      onReset();
      setPulse(true);
    } else if (armed) {
      // Already at 1×: still acknowledge the gesture landed.
      setPulse(true);
    }
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    // Interrupted drag (capture lost, alt-tab…): put the rate back.
    if (rate !== drag.startRate) onRateChange(drag.startRate);
    endDrag();
  };

  // Acquiring pointer lock implicitly releases pointer capture — that
  // lostpointercapture must not cancel the drag it belongs to.
  const onLostCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (document.pointerLockElement === chipRef.current) return;
    onPointerCancel(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (KEY_RESET.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (rate !== 1) {
        onReset();
        setPulse(true);
      }
      return;
    }
    const steps = KEY_STEPS[event.key];
    const next =
      steps != null
        ? clampPlaybackRate(rate + steps * PLAYBACK_RATE_STEP)
        : KEY_JUMPS[event.key];
    if (next == null) return;
    event.preventDefault();
    event.stopPropagation();
    if (next !== rate) onRateChange(next);
  };

  const scrubbing = dragRef.current != null && !closing;
  const armed = armX >= 1;
  const stops = tapeStops();

  return (
    <div
      className="you-loop-speed"
      role="group"
      aria-label="Playback speed"
      data-disabled={disabled}
    >
      <button
        ref={chipRef}
        type="button"
        role="slider"
        aria-label="Playback speed — drag up or down to change, drag right and release to reset"
        aria-valuemin={MIN_PLAYBACK_RATE}
        aria-valuemax={MAX_PLAYBACK_RATE}
        aria-valuenow={rate}
        aria-valuetext={formatRate(rate)}
        className="you-loop-speed-value"
        title="Drag ↕ speed · fling → reset"
        data-modified={rate !== 1}
        data-scrubbing={scrubbing}
        data-pulse={pulse}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostCapture}
        onMouseDown={swallow}
        onClick={swallow}
        onKeyDown={onKeyDown}
        onAnimationEnd={() => setPulse(false)}
      >
        <span className="you-loop-speed-num">
          {Number(rate.toFixed(2))}
          <span className="you-loop-speed-x">×</span>
        </span>
      </button>

      {open &&
        container != null &&
        createPortal(
          <div
            className="you-loop-speed-pop"
            data-closing={closing}
            data-armed={armed}
            style={
              {
                left: `${anchor.left}px`,
                top: `${anchor.top}px`,
                "--you-loop-arm": armX
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <div className="you-loop-speed-rail">
              <div
                className="you-loop-speed-tape"
                style={{ transform: `translateY(${tapeOffset(rate)}px)` }}
              >
                {stops.map((stop) => (
                  <div
                    key={stop}
                    className="you-loop-speed-tick"
                    data-labeled={isLabeled(stop)}
                    data-home={stop === 1}
                    data-current={stop === rate}
                    style={{ top: `${tapeY(stop)}px` }}
                  >
                    {isLabeled(stop) && (
                      <span className="you-loop-speed-tick-label">
                        {Number(stop.toFixed(2))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="you-loop-speed-needle" />
            </div>
            {/* Outside the rail: its overflow clip + edge mask would swallow
                anything hanging past the rounded frame. */}
            <span className="you-loop-speed-needle-value">
              {formatRate(rate)}
            </span>
            <div className="you-loop-speed-reset-target">
              <svg
                className="you-loop-speed-reset-chevrons"
                viewBox="0 0 26 12"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M2 1.5 L7 6 L2 10.5" />
                <path d="M10 1.5 L15 6 L10 10.5" />
                <path d="M18 1.5 L23 6 L18 10.5" />
              </svg>
              <span className="you-loop-speed-reset-col">
                <span className="you-loop-speed-reset-ring">1×</span>
                <span className="you-loop-speed-reset-word">
                  {armed ? "release" : "reset"}
                </span>
              </span>
            </div>
          </div>,
          container
        )}
    </div>
  );
}
