import { createPortal } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useEffect, useRef, useState } from "react";
import type { PitchSettings } from "../persistence/pitchStore";
import {
  centsFromDrag,
  centsTapeOffset,
  centsTapeStops,
  centsTapeY,
  formatCents,
  formatPitch,
  formatPitchDecimal,
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
  available: boolean;
  disabled: boolean;
  /** Portal host for the scrubber popover (the player element); the panel's
      cluster clips overflow, so the popover cannot live inside the pill. */
  container: HTMLElement | null;
  onChange: (settings: PitchSettings) => void;
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
  available,
  disabled,
  container,
  onChange,
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
    // Press-time values, for restoring on an interrupted drag.
    pressSemitones: number;
    pressCents: number;
    // The active gear's baselines. Each gear change rebases its start value
    // and Y origin so the value never jumps at the crossover.
    startSemitones: number;
    coarseBaseY: number;
    coarseBaseX: number;
    // Fine (cents) gear: held while Shift is held.
    fine: boolean;
    fineBaseY: number;
    fineBaseCents: number;
    fineBaseX: number;
    // The fine reset snaps cents to 0 the moment the rightward pull arms —
    // once per excursion; re-arms after backing fully out of the reveal zone.
    fineSnapped: boolean;
  }>(container);

  // 0–1 reveal of the snap-back target; ≥ 1 means release resets.
  const [armX, setArmX] = useState(0);
  const [fine, setFine] = useState(false);
  // True once the gear has flipped during this hold — gates the lens zoom
  // animation so the tape doesn't zoom on the popover's initial open.
  const [zoomed, setZoomed] = useState(false);

  const blocked = disabled || !available;

  // The window Shift listeners below outlive any single render; they read the
  // live settings through this ref instead of a stale closure.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /** Move the drag into or out of the cents gear, rebasing the incoming
      gear's start value and X/Y origins so neither the value nor the reset
      gesture inherits the other gear's travel. */
  const setGear = (next: boolean) => {
    const drag = dragRef.current;
    if (drag == null || drag.fine === next) return;
    const current = settingsRef.current;
    if (next) {
      drag.fine = true;
      drag.fineBaseY = drag.accY;
      drag.fineBaseCents = current.cents;
      drag.fineBaseX = drag.accX;
      drag.fineSnapped = false;
    } else {
      drag.fine = false;
      drag.startSemitones = current.semitones;
      drag.coarseBaseY = drag.accY;
      drag.coarseBaseX = drag.accX;
    }
    setArmX(0);
    setFine(next);
    setZoomed(true);
  };

  // Shift can be pressed while the pointer is stationary — no pointermove
  // fires, so the gear change must come from the keyboard directly.
  useEffect(() => {
    if (!open) return;
    const onShift = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Shift") return;
      setGear(event.type === "keydown");
    };
    window.addEventListener("keydown", onShift, true);
    window.addEventListener("keyup", onShift, true);
    return () => {
      window.removeEventListener("keydown", onShift, true);
      window.removeEventListener("keyup", onShift, true);
    };
    // setGear reaches state only through refs, so the mount-time closure stays valid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finishDrag = () => {
    setArmX(0);
    setFine(false);
    setZoomed(false);
    endDrag();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    swallow(event);
    if (blocked || dragRef.current != null) return;
    setArmX(0);
    setZoomed(false);
    // Shift already held at press: open straight onto the cents gear.
    setFine(event.shiftKey);
    beginDrag(event, {
      pressSemitones: settings.semitones,
      pressCents: settings.cents,
      startSemitones: settings.semitones,
      coarseBaseY: 0,
      coarseBaseX: 0,
      fine: event.shiftKey,
      fineBaseY: 0,
      fineBaseCents: settings.cents,
      fineBaseX: 0,
      fineSnapped: false
    });
  };

  type PitchDrag = NonNullable<typeof dragRef.current>;

  const moveFine = (drag: PitchDrag) => {
    // Fine reset: the rightward pull zeroes the cents the instant it arms —
    // no release, the drag stays alive and the dial stays up.
    const progress = resetProgress(drag.accX - drag.fineBaseX);
    setArmX(progress);
    if (progress >= 1) {
      if (!drag.fineSnapped) {
        drag.fineSnapped = true;
        drag.fineBaseY = drag.accY;
        drag.fineBaseCents = 0;
        if (settings.cents !== 0) onChange({ ...settings, cents: 0 });
        setPulse(true);
      }
      return;
    }
    if (progress <= 0) drag.fineSnapped = false;
    // Cents gear: vertical travel from the gear change (or the last snap)
    // trims cents.
    const next = centsFromDrag(
      drag.fineBaseCents,
      -(drag.accY - drag.fineBaseY)
    );
    if (next !== settings.cents) onChange({ ...settings, cents: next });
  };

  const moveCoarse = (drag: PitchDrag) => {
    const progress = resetProgress(drag.accX - drag.coarseBaseX);
    setArmX(progress);
    // While the reset gesture is armed the tape freezes; vertical motion
    // resumes if the user backs out of it.
    if (progress < 1) {
      const next = semitonesFromDrag(
        drag.startSemitones,
        -(drag.accY - drag.coarseBaseY)
      );
      if (next !== settings.semitones) onChange({ ...settings, semitones: next });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = foldMove(event);
    if (drag == null) return;
    // Modifier state rides on every pointer event — this catches a Shift
    // press/release the window listeners missed (e.g. focus was elsewhere).
    setGear(event.shiftKey);
    if (drag.fine) moveFine(drag);
    else moveCoarse(drag);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = foldRelease(event);
    if (drag == null) return;
    const armed =
      !drag.fine && resetProgress(drag.accX - drag.coarseBaseX) >= 1;
    if (drag.moved) suppressNextClick();
    finishDrag();
    if (armed) {
      if (!isZeroPitch(settings)) onReset();
      // Acknowledge the gesture landed even when already at 0.
      setPulse(true);
    }
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    // Interrupted drag (capture lost, alt-tab…): put the settings back.
    if (
      settings.semitones !== drag.pressSemitones ||
      settings.cents !== drag.pressCents
    ) {
      onChange({
        semitones: drag.pressSemitones,
        cents: drag.pressCents
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
        aria-label="Pitch — drag up or down to transpose, hold Shift while dragging for cents, drag right and release to reset"
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={settings.semitones}
        aria-valuetext={label}
        className="you-loop-pitch-value"
        title="Drag ↕ pitch · hold ⇧ cents · fling ⇢ reset"
        data-modified={modified}
        data-scrubbing={scrubbing}
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
        {/* Decimal readout: cents are hundredths of a semitone, so +3 +45¢
            reads "+3.45" — a fraction on the pill is the tell that a fine
            trim is applied. */}
        <span className="you-loop-pitch-num">
          {formatPitchDecimal(settings)}
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
            data-zoomed={zoomed}
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
              {/* The lens remounts on each gear change (key) so its zoom
                  animation replays: cents ticks spread out of the semitone
                  scale, and collapse back into it on the way out. */}
              {fine ? (
                <div key="fine" className="you-loop-pitch-lens" data-gear="fine">
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
                </div>
              ) : (
                <div key="coarse" className="you-loop-pitch-lens" data-gear="coarse">
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
                <span className="you-loop-speed-reset-ring">
                  {fine ? "0¢" : "0"}
                </span>
                <span className="you-loop-speed-reset-word">
                  {fine
                    ? armed
                      ? "zeroed"
                      : "zero"
                    : armed
                      ? "release"
                      : "reset"}
                </span>
              </span>
            </div>
            {/* Left flank: a shift keycap advertising the cents gear. Idles
                faint; fills amber while Shift holds the lens zoomed in. */}
            <div className="you-loop-pitch-fine-target">
              <span className="you-loop-pitch-fine-col">
                <span className="you-loop-pitch-fine-key">⇧</span>
                <span className="you-loop-pitch-fine-word">
                  {fine ? "cents" : "fine"}
                </span>
              </span>
            </div>
          </div>,
          container
        )}
    </div>
  );
}
