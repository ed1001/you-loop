import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  CSSProperties,
  MouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type { PitchSettings } from "../persistence/pitchStore";
import {
  MAX_CENTS,
  MIN_CENTS,
  clampCents,
  formatPitch,
  semitonesFromDrag
} from "../pitch/pitchScrub";

type Props = {
  settings: PitchSettings;
  enabled: boolean;
  available: boolean;
  disabled: boolean;
  /** Portal host for the popover (the player element); the panel cluster clips
      overflow, so the popover cannot live inside the pill. */
  container: HTMLElement | null;
  onChange: (settings: PitchSettings) => void;
  onToggleEnabled: () => void;
  onReset: () => void;
};

const POP_EXIT_MS = 140;

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
  const chipRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startSemitones: number;
    moved: boolean;
    accY: number;
  } | null>(null);
  const exitTimerRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });

  useEffect(() => () => window.clearTimeout(exitTimerRef.current), []);

  const blocked = disabled || !available;

  // Pin our overlay and YouTube's chrome visible while scrubbing, hiding the
  // cursor (reusing the speed-scrub flag's CSS rule).
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

  // The drag's release can land over a YouTube control; swallow the synthetic
  // click once, in capture, so the gesture stays ours.
  const suppressNextClick = () => {
    const swallowOnce = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallowOnce, { capture: true, once: true });
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

  const togglePopover = () => {
    if (open && !closing) closePopover();
    else openPopover();
  };

  const endDrag = () => {
    dragRef.current = null;
    if (document.pointerLockElement === chipRef.current) {
      document.exitPointerLock?.();
    }
    setDragLock(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    swallow(event);
    if (blocked || dragRef.current != null) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startSemitones: settings.semitones,
      moved: false,
      accY: 0
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // keep the drag alive
    }
    try {
      const lock = event.currentTarget.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      lock?.catch?.(() => {});
    } catch {
      // keep the drag alive
    }
    setDragLock(true);
  };

  const trackTravel = (
    drag: NonNullable<typeof dragRef.current>,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (document.pointerLockElement === chipRef.current) {
      drag.accY += event.movementY ?? 0;
    } else {
      drag.accY = event.clientY - drag.startY;
    }
    if (Math.abs(drag.accY) > 2) drag.moved = true;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    swallow(event);
    trackTravel(drag, event);
    const next = semitonesFromDrag(drag.startSemitones, -drag.accY);
    if (next !== settings.semitones) onChange({ ...settings, semitones: next });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    swallow(event);
    trackTravel(drag, event);
    const moved = drag.moved;
    endDrag();
    if (moved) suppressNextClick();
    else togglePopover();
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return;
    if (settings.semitones !== drag.startSemitones) {
      onChange({ ...settings, semitones: drag.startSemitones });
    }
    endDrag();
  };

  const onLostCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (document.pointerLockElement === chipRef.current) return;
    onPointerCancel(event);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePopover();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scrubbing = dragRef.current != null;
  const label = formatPitch(settings);
  const modified = settings.semitones !== 0 || settings.cents !== 0;

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
        aria-label="Pitch — drag up or down to transpose by semitones, click for fine tuning and on/off"
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={settings.semitones}
        aria-valuetext={label}
        className="you-loop-pitch-value"
        title="Drag ↕ pitch · click for fine / on-off / reset"
        data-modified={modified}
        data-scrubbing={scrubbing}
        data-off={!enabled}
        disabled={blocked}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostCapture}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <span className="you-loop-pitch-num">{label}</span>
        <span className="you-loop-pitch-unit">st</span>
      </button>

      {open &&
        container != null &&
        createPortal(
          <div
            className="you-loop-pitch-pop"
            data-closing={closing}
            style={
              { left: `${anchor.left}px`, top: `${anchor.top}px` } as CSSProperties
            }
            onPointerDown={swallow}
            onMouseDown={swallow}
            onClick={swallow}
          >
            <div className="you-loop-pitch-pop-row">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={enabled ? "Turn pitch off" : "Turn pitch on"}
                className="you-loop-pitch-switch"
                data-on={enabled}
                onClick={(e) => {
                  swallow(e);
                  onToggleEnabled();
                }}
              >
                {enabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                className="you-loop-pitch-reset"
                onClick={(e) => {
                  swallow(e);
                  onReset();
                }}
              >
                Reset
              </button>
            </div>
            <label className="you-loop-pitch-fine">
              <span className="you-loop-pitch-fine-label">Fine</span>
              <input
                type="range"
                min={MIN_CENTS}
                max={MAX_CENTS}
                step={1}
                value={settings.cents}
                onChange={(e) =>
                  onChange({ ...settings, cents: clampCents(Number(e.target.value)) })
                }
              />
              <span className="you-loop-pitch-fine-value">
                {settings.cents > 0 ? `+${settings.cents}` : settings.cents}¢
              </span>
            </label>
          </div>,
          container
        )}
    </div>
  );
}
