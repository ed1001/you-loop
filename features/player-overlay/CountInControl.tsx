// features/player-overlay/CountInControl.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import type { CountInSettings } from "../persistence/countInStore";
import { bpmFromTaps, clampBpm, MIN_BPM, MAX_BPM } from "../playback/tapTempo";
import {
  bpmFromDrag,
  isLabeledBpm,
  tapeOffset,
  tapeStops,
  tapeY
} from "./bpmScrub";

export type CountInControlProps = {
  enabled: boolean; // consumed by parent; reserved for future conditional mounting
  on: boolean;
  settings: CountInSettings;
  container: HTMLElement | null;
  disabled: boolean;
  onToggle: () => void;
  onSettingsChange: (next: CountInSettings) => void;
  now?: () => number;
};

const SIGS: { beatsPerBar: number; noteValue: number; label: string }[] = [
  { beatsPerBar: 2, noteValue: 4, label: "2/4" },
  { beatsPerBar: 3, noteValue: 4, label: "3/4" },
  { beatsPerBar: 4, noteValue: 4, label: "4/4" },
  { beatsPerBar: 6, noteValue: 8, label: "6/8" }
];

const swallow = (e: MouseEvent | PointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

// Must cover the you-loop-countin-pop-out animation duration.
const POP_EXIT_MS = 140;

export function CountInControl({
  on,
  settings,
  container,
  disabled,
  onToggle,
  onSettingsChange,
  now = () => performance.now()
}: CountInControlProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const tapsRef = useRef<number[]>([]);
  const padRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const bpmDragRef = useRef<{
    pointerId: number;
    startY: number;
    startBpm: number;
    accY: number;
  } | null>(null);
  const flashTimerRef = useRef(0);
  const closeTimerRef = useRef(0);
  const [open, setOpen] = useState(false);
  // Kept mounted briefly after a close so the popover can play its exit
  // animation before unmounting (mirrors the zoom strip's closing pattern).
  const [closing, setClosing] = useState(false);
  const [tapFlash, setTapFlash] = useState(false);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });

  useEffect(
    () => () => {
      window.clearTimeout(flashTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const closePopover = () => {
    if (!open || closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, POP_EXIT_MS);
  };

  // Dismiss the popover on an outside click or Escape — it is a persistent
  // panel (unlike the speed scrubber, which lives only for the duration of a
  // drag), so it needs explicit dismissal. The pointerdown listener is on the
  // capture phase so it sees clicks even though the popover's own handlers
  // stopPropagation; the ref guards keep clicks inside the popover or on the
  // pill button from closing it.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: Event) => {
      const t = e.target as Node | null;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      closePopover();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePopover();
      }
    };
    // The popover is anchored to the pill's position captured at open time;
    // re-capture when the player resizes (theater mode, window resize) so it
    // doesn't hang in the old spot.
    const onResize = () => updateAnchor();
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing]);

  const updateAnchor = () => {
    const btn = btnRef.current;
    if (btn == null || container == null) return;
    const b = btn.getBoundingClientRect();
    const h = container.getBoundingClientRect();
    setAnchor({ left: b.left + b.width / 2 - h.left, top: b.top - h.top });
  };

  // The pill button only opens/closes the settings popover. On/off lives on the
  // switch inside the popover, so the button never has to mean two things.
  const onButtonClick = (e: MouseEvent) => {
    swallow(e);
    if (open) {
      closePopover();
    } else {
      updateAnchor();
      setOpen(true);
    }
  };

  const tap = (e: MouseEvent) => {
    swallow(e);
    const t = now();
    const recent = [...tapsRef.current, t].filter((x) => t - x < 3000);
    tapsRef.current = recent;
    // Flash the pad and ripple out from the strike point.
    setTapFlash(true);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setTapFlash(false), 95);
    const pad = padRef.current;
    if (pad != null) {
      const r = pad.getBoundingClientRect();
      const ring = document.createElement("span");
      ring.className = "you-loop-countin-ripple";
      ring.style.left = `${e.clientX - r.left}px`;
      ring.style.top = `${e.clientY - r.top}px`;
      pad.appendChild(ring);
      window.setTimeout(() => ring.remove(), 520);
    }
    const bpm = bpmFromTaps(recent);
    if (bpm != null) onSettingsChange({ ...settings, bpm });
  };

  // The BPM rail is a press-and-drag scrubber mirroring the speed control:
  // pointer-lock the cursor and integrate movementY so the tape tracks the
  // finger without the OS cursor wandering off the rail (clientY fallback for
  // when lock is denied — also the test path).
  const onBpmPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallow(e);
    bpmDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startBpm: settings.bpm,
      accY: 0
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // uncaptured drag still works
    }
    try {
      const lock = e.currentTarget.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      lock?.catch?.(() => {});
    } catch {
      // keep the drag alive
    }
  };
  const onBpmPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = bpmDragRef.current;
    if (d == null || e.pointerId !== d.pointerId) return;
    swallow(e);
    if (document.pointerLockElement === railRef.current) {
      d.accY += e.movementY ?? 0;
    } else {
      d.accY = e.clientY - d.startY;
    }
    const next = bpmFromDrag(d.startBpm, -d.accY);
    if (next !== settings.bpm) onSettingsChange({ ...settings, bpm: next });
  };
  const endBpmDrag = () => {
    bpmDragRef.current = null;
    if (document.pointerLockElement === railRef.current) {
      document.exitPointerLock?.();
    }
  };
  const onBpmPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = bpmDragRef.current;
    if (d == null || e.pointerId !== d.pointerId) return;
    swallow(e);
    endBpmDrag();
  };
  // requestPointerLock implicitly releases pointer capture; that
  // lostpointercapture must not end the drag it belongs to.
  const onBpmLostCapture = () => {
    if (document.pointerLockElement === railRef.current) return;
    endBpmDrag();
  };

  // Keyboard access for the rail: arrows ±1 BPM, Shift+arrows ±5. Swallowed so
  // YouTube's own arrow-key seek/volume handlers never see them.
  const onBpmKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = clampBpm(settings.bpm + dir * (e.shiftKey ? 5 : 1));
    if (next !== settings.bpm) onSettingsChange({ ...settings, bpm: next });
  };

  return (
    <div className="you-loop-countin" data-disabled={disabled}>
      <button
        ref={btnRef}
        type="button"
        className="you-loop-countin-toggle"
        data-on={on}
        aria-pressed={on}
        aria-label={on ? "Count-in on" : "Count-in off"}
        disabled={disabled}
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={onButtonClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 3h6l3 16H6L9 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 19V7l5-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        container != null &&
        createPortal(
          <div
            ref={popRef}
            className="you-loop-countin-pop"
            data-closing={closing ? "true" : undefined}
            style={{ left: `${anchor.left}px`, top: `${anchor.top}px` } as CSSProperties}
            onPointerDown={swallow}
            onMouseDown={swallow}
            onClick={swallow}
          >
            <div className="you-loop-countin-head">
              <span className="you-loop-countin-headname">Count-in</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={on ? "Turn count-in off" : "Turn count-in on"}
                className="you-loop-countin-switch"
                data-on={on}
                onClick={(e) => {
                  swallow(e);
                  onToggle();
                }}
              />
            </div>

            <p className="you-loop-countin-hint">
              Plays a metronome count before the loop starts.
            </p>

            <span className="you-loop-countin-label">Tempo</span>
            <div className="you-loop-countin-tempo">
              <button
                ref={padRef}
                type="button"
                className="you-loop-countin-tap"
                data-flash={tapFlash}
                aria-label="Tap tempo"
                onClick={tap}
              >
                <span className="you-loop-countin-tap-read">
                  {settings.bpm}
                  <span className="you-loop-countin-tap-unit">BPM</span>
                </span>
                <span className="you-loop-countin-tap-hint">tap</span>
              </button>
              <div
                ref={railRef}
                className="you-loop-countin-rail"
                role="slider"
                tabIndex={0}
                aria-label="Tempo (BPM) — drag up or down"
                aria-valuemin={MIN_BPM}
                aria-valuemax={MAX_BPM}
                aria-valuenow={settings.bpm}
                onKeyDown={onBpmKeyDown}
                onPointerDown={onBpmPointerDown}
                onPointerMove={onBpmPointerMove}
                onPointerUp={onBpmPointerUp}
                onLostPointerCapture={onBpmLostCapture}
              >
                <div
                  className="you-loop-countin-tape"
                  style={{ transform: `translateY(${tapeOffset(settings.bpm)}px)` }}
                >
                  {tapeStops().map((stop) => (
                    <div
                      key={stop}
                      className="you-loop-countin-tick"
                      data-labeled={isLabeledBpm(stop)}
                      style={{ top: `${tapeY(stop)}px` } as CSSProperties}
                    >
                      {isLabeledBpm(stop) && (
                        <span className="you-loop-countin-tick-label">{stop}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="you-loop-countin-needle" />
              </div>
            </div>

            <span className="you-loop-countin-label">Time signature</span>
            <div className="you-loop-countin-seg" role="group" aria-label="Time signature">
              {SIGS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  data-sig={s.beatsPerBar}
                  data-active={settings.beatsPerBar === s.beatsPerBar && settings.noteValue === s.noteValue}
                  onClick={(e) => {
                    swallow(e);
                    onSettingsChange({ ...settings, beatsPerBar: s.beatsPerBar, noteValue: s.noteValue });
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <span className="you-loop-countin-label">Bars</span>
            <div className="you-loop-countin-seg" role="group" aria-label="Bars">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  data-bars={n}
                  data-active={settings.bars === n}
                  onClick={(e) => {
                    swallow(e);
                    onSettingsChange({ ...settings, bars: n });
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>,
          container
        )}
    </div>
  );
}
