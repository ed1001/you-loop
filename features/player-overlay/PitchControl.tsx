import { createPortal } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useState } from "react";
import type { PitchSettings } from "../persistence/pitchStore";
import {
  centsFromDrag,
  centsTapeOffset,
  centsTapeStops,
  centsTapeY,
  fineProgress,
  formatCents,
  formatPitch,
  formatSemitones,
  isZeroPitch,
  pitchFromKey,
  resetProgress,
  semitoneTapeOffset,
  semitoneTapeStops,
  semitoneTapeY,
  semitonesFromDrag
} from "../pitch/pitchScrub";
import { useScrubChip } from "./useScrubChip";

type Props = {
  settings: PitchSettings;
  enabled: boolean;
  available: boolean;
  disabled: boolean;
  /** Portal host for the scrubber popover (the player element); the panel's
      cluster clips overflow, so the popover cannot live inside the pill. */
  container: HTMLElement | null;
  onChange: (settings: PitchSettings) => void;
  onToggleEnabled: () => void;
  onReset: () => void;
};

// Even semitones carry a printed value; odd ones are bare ticks.
const isLabeled = (stop: number) => stop % 2 === 0;

// Cents ticks are labeled at the quarter-tone marks and zero.
const isCentsLabeled = (stop: number) => stop % 25 === 0;

const KEY_RESET = new Set(["Enter", "Backspace", "Delete"]);

const swallow = (event: MouseEvent | ReactPointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function PitchControl({
  settings,
  enabled,
  available,
  disabled,
  container,
  onChange,
  onToggleEnabled,
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
  } = useScrubChip<{
    startSemitones: number;
    // Fine gear latches for the rest of the hold once the leftward drag
    // crosses the arm threshold; cents then track vertical travel from the
    // latch point.
    fine: boolean;
    fineBaseY: number;
    fineBaseCents: number;
  }>(container);

  // 0–1 reveal of the snap-back target; ≥ 1 means release resets.
  const [armX, setArmX] = useState(0);
  // 0–1 reveal of the fine-gear target; 1 latches cents gear.
  const [fineX, setFineX] = useState(0);
  const [fine, setFine] = useState(false);

  const blocked = disabled || !available;

  const finishDrag = () => {
    setArmX(0);
    setFineX(0);
    setFine(false);
    endDrag();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    swallow(event);
    if (blocked || dragRef.current != null) return;
    setArmX(0);
    setFineX(0);
    setFine(false);
    beginDrag(event, {
      startSemitones: settings.semitones,
      fine: false,
      fineBaseY: 0,
      fineBaseCents: settings.cents
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = foldMove(event);
    if (drag == null) return;

    if (drag.fine) {
      // Cents gear: vertical travel from the latch point trims cents.
      const next = centsFromDrag(drag.fineBaseCents, -(drag.accY - drag.fineBaseY));
      if (next !== settings.cents) onChange({ ...settings, cents: next });
      return;
    }

    const fineP = fineProgress(-drag.accX);
    setFineX(fineP);
    if (fineP >= 1) {
      // Latch into cents gear for the rest of the hold.
      drag.fine = true;
      drag.fineBaseY = drag.accY;
      drag.fineBaseCents = settings.cents;
      setFine(true);
      setArmX(0);
      return;
    }

    const progress = resetProgress(drag.accX);
    setArmX(progress);
    // While the reset gesture is armed the tape freezes; vertical motion
    // resumes if the user backs out of it.
    if (progress < 1) {
      const next = semitonesFromDrag(drag.startSemitones, -drag.accY);
      if (next !== settings.semitones) onChange({ ...settings, semitones: next });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = foldRelease(event);
    if (drag == null) return;
    const armed = !drag.fine && resetProgress(drag.accX) >= 1;
    const moved = drag.moved;
    finishDrag();
    if (moved) suppressNextClick();
    if (armed) {
      if (!isZeroPitch(settings)) onReset();
      // Acknowledge the gesture landed even when already at 0.
      setPulse(true);
      return;
    }
    // A plain click (no travel) toggles the bypass: instant A/B against the
    // untouched original without losing the dialled offset.
    if (!moved) onToggleEnabled();
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    // Interrupted drag (capture lost, alt-tab…): put the settings back.
    if (
      settings.semitones !== drag.startSemitones ||
      settings.cents !== drag.fineBaseCents
    ) {
      onChange({
        semitones: drag.startSemitones,
        cents: drag.fineBaseCents
      });
    }
    finishDrag();
  };

  // Acquiring pointer lock implicitly releases pointer capture — that
  // lostpointercapture must not cancel the drag it belongs to.
  const onLostCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isLocked()) return;
    onPointerCancel(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (blocked) return;
    if (KEY_RESET.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!isZeroPitch(settings)) {
        onReset();
        setPulse(true);
      }
      return;
    }
    const next = pitchFromKey(settings, event.key, event.shiftKey);
    if (next == null) return;
    event.preventDefault();
    event.stopPropagation();
    if (next.semitones !== settings.semitones || next.cents !== settings.cents) {
      onChange(next);
    }
  };

  const scrubbing = dragRef.current != null && !closing;
  const armed = armX >= 1;
  const label = formatPitch(settings);
  const modified = !isZeroPitch(settings);

  return (
    <div
      className="you-loop-pitch"
      role="group"
      aria-label="Pitch"
      data-disabled={blocked}
    >
      <button
        ref={chipRef}
        type="button"
        role="slider"
        aria-label="Pitch — drag up or down to transpose, drag left for cents, drag right and release to reset, click to bypass"
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={settings.semitones}
        aria-valuetext={label}
        className="you-loop-pitch-value"
        title="Drag ↕ pitch · ⇠ fine · fling ⇢ reset · click bypass"
        data-modified={modified}
        data-scrubbing={scrubbing}
        data-off={!enabled}
        data-pulse={pulse}
        disabled={blocked}
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
        <span className="you-loop-pitch-num">
          {formatSemitones(settings.semitones)}
          <span className="you-loop-pitch-st">st</span>
        </span>
      </button>

      {open &&
        container != null &&
        createPortal(
          // Reuses the speed scrubber's rail/tape/needle/reset styles — the
          // two controls share one visual system on purpose.
          <div
            className="you-loop-speed-pop you-loop-pitch-pop"
            data-closing={closing}
            data-armed={armed}
            data-fine={fine}
            style={
              {
                left: `${anchor.left}px`,
                top: `${anchor.top}px`,
                "--you-loop-arm": armX,
                "--you-loop-fine": fineX
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <div className="you-loop-speed-rail">
              {fine ? (
                <div
                  className="you-loop-speed-tape"
                  style={{
                    transform: `translateY(${centsTapeOffset(settings.cents)}px)`
                  }}
                >
                  {centsTapeStops().map((stop) => (
                    <div
                      key={stop}
                      className="you-loop-speed-tick"
                      data-labeled={isCentsLabeled(stop)}
                      data-home={stop === 0}
                      data-current={stop === settings.cents}
                      style={{ top: `${centsTapeY(stop)}px` }}
                    >
                      {isCentsLabeled(stop) && (
                        <span className="you-loop-speed-tick-label">
                          {formatCents(stop)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="you-loop-speed-tape"
                  style={{
                    transform: `translateY(${semitoneTapeOffset(settings.semitones)}px)`
                  }}
                >
                  {semitoneTapeStops().map((stop) => (
                    <div
                      key={stop}
                      className="you-loop-speed-tick"
                      data-labeled={isLabeled(stop)}
                      data-home={stop === 0}
                      data-current={stop === settings.semitones}
                      style={{ top: `${semitoneTapeY(stop)}px` }}
                    >
                      {isLabeled(stop) && (
                        <span className="you-loop-speed-tick-label">
                          {formatSemitones(stop)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="you-loop-speed-needle" />
            </div>
            {/* Outside the rail: its overflow clip + edge mask would swallow
                anything hanging past the rounded frame. */}
            <span className="you-loop-speed-needle-value">{label}</span>
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
                <span className="you-loop-speed-reset-ring">0</span>
                <span className="you-loop-speed-reset-word">
                  {armed ? "release" : "reset"}
                </span>
              </span>
            </div>
            {/* Mirror of the reset target on the left: pull toward it to shift
                into cents gear. */}
            <div className="you-loop-pitch-fine-target">
              <span className="you-loop-pitch-fine-col">
                <span className="you-loop-pitch-fine-ring">¢</span>
                <span className="you-loop-pitch-fine-word">
                  {fine ? "cents" : "fine"}
                </span>
              </span>
              <svg
                className="you-loop-pitch-fine-chevrons"
                viewBox="0 0 26 12"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M24 1.5 L19 6 L24 10.5" />
                <path d="M16 1.5 L11 6 L16 10.5" />
                <path d="M8 1.5 L3 6 L8 10.5" />
              </svg>
            </div>
          </div>,
          container
        )}
    </div>
  );
}
