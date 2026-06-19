// features/player-overlay/CountInControl.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import type { CountInSettings } from "../persistence/countInStore";
import { bpmFromTaps, clampBpm, MIN_BPM, MAX_BPM } from "../playback/tapTempo";

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
  const dragRef = useRef<{ y: number; bpm: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });

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
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

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
    if (!open) updateAnchor();
    setOpen((v) => !v);
  };

  const tap = (e: MouseEvent) => {
    swallow(e);
    const t = now();
    const recent = [...tapsRef.current, t].filter((x) => t - x < 3000);
    tapsRef.current = recent;
    const bpm = bpmFromTaps(recent);
    if (bpm != null) onSettingsChange({ ...settings, bpm });
  };

  const onBpmPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallow(e);
    dragRef.current = { y: e.clientY, bpm: settings.bpm };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // uncaptured drag still works
    }
  };
  const onBpmPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d == null) return;
    swallow(e);
    const next = clampBpm(d.bpm + Math.round((d.y - e.clientY) / 4));
    if (next !== settings.bpm) onSettingsChange({ ...settings, bpm: next });
  };
  const onBpmPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    swallow(e);
    dragRef.current = null;
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
              Plays a metronome count before each loop repeat. You come in on the
              downbeat.
            </p>

            <span className="you-loop-countin-label">Tempo</span>
            <button type="button" className="you-loop-countin-tap" onClick={tap}>
              Tap in time
            </button>

            <div className="you-loop-countin-bpmrow">
              <div
                className="you-loop-countin-bpm"
                role="slider"
                aria-label="Tempo (BPM) — drag up or down"
                aria-valuemin={MIN_BPM}
                aria-valuemax={MAX_BPM}
                aria-valuenow={settings.bpm}
                onPointerDown={onBpmPointerDown}
                onPointerMove={onBpmPointerMove}
                onPointerUp={onBpmPointerUp}
                onLostPointerCapture={onBpmPointerUp}
              >
                {settings.bpm}
                <span className="you-loop-countin-bpm-unit">BPM</span>
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
