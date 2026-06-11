import type { MouseEvent, PointerEvent } from "react";
import type { PlayMode } from "../playback/types";

type Props = {
  enabled: boolean;
  mode: PlayMode;
  onToggleEnabled: () => void;
  onToggleMode: () => void;
};

// YouTube binds mouse/pointer handlers on the progress bar; these controls are
// descendants of it, so swallow those events to avoid scrubbing the video.
const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const MODES: { value: PlayMode; label: string }[] = [
  { value: "loop", label: "Loop" },
  { value: "one-shot", label: "One-shot" }
];

export function LoopPanel({ enabled, mode, onToggleEnabled, onToggleMode }: Props) {
  return (
    <div className="you-loop-panel" data-on={enabled}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Disable loop range" : "Enable loop range"}
        className="you-loop-power"
        data-on={enabled}
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={(event) => {
          swallow(event);
          onToggleEnabled();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 3.5v7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M7.6 6.6a7 7 0 1 0 8.8 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div
        className="you-loop-modes"
        role="group"
        aria-label="Playback mode"
        data-disabled={!enabled}
      >
        {MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className="you-loop-mode-option"
            data-active={mode === value}
            onPointerDown={swallow}
            onMouseDown={swallow}
            onClick={(event) => {
              swallow(event);
              if (mode !== value) {
                onToggleMode();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
