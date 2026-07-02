import { createPortal } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useState } from "react";
import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  PLAYBACK_RATE_STEP,
  clampPlaybackRate
} from "../playback/reducer";
import {
  rateFromDrag,
  resetProgress,
  tapeOffset,
  tapeStops,
  tapeY
} from "./speedScrub";
import { useScrubChip } from "./useScrubChip";

type Props = {
  rate: number;
  disabled: boolean;
  /** Portal host for the scrubber popover (the player element); the panel's
      cluster clips overflow, so the popover cannot live inside the pill. */
  container: HTMLElement | null;
  onRateChange: (rate: number) => void;
  onReset: () => void;
};

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
  const {
    chipRef,
    dragRef,
    open,
    closing,
    anchor,
    pulse,
    setPulse,
    beginDrag,
    foldMove,
    foldRelease,
    endDrag,
    suppressNextClick,
    isLocked
  } = useScrubChip<{ startRate: number }>(container);

  // 0–1 reveal of the snap-back target; ≥ 1 means release resets.
  const [armX, setArmX] = useState(0);

  const finishDrag = () => {
    setArmX(0);
    endDrag();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    swallow(event);
    if (disabled || dragRef.current != null) return;
    setArmX(0);
    beginDrag(event, { startRate: rate });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = foldMove(event);
    if (drag == null) return;
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
    const drag = foldRelease(event);
    if (drag == null) return;
    const armed = resetProgress(drag.accX) >= 1;
    if (drag.moved) suppressNextClick();
    finishDrag();
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
    finishDrag();
  };

  // Acquiring pointer lock implicitly releases pointer capture — that
  // lostpointercapture must not cancel the drag it belongs to.
  const onLostCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isLocked()) return;
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
