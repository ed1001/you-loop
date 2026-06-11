import { useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { PlayMode } from "../playback/types";
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE } from "../playback/reducer";
import { SavedLoopsPopover } from "./SavedLoopsPopover";
import type { SavedLoop } from "../persistence/loopStore";

type Props = {
  enabled: boolean;
  mode: PlayMode;
  zoomed: boolean;
  playbackRate: number;
  onToggleEnabled: () => void;
  onToggleMode: () => void;
  onToggleZoom: () => void;
  onSpeedDown: () => void;
  onSpeedUp: () => void;
  onResetSpeed: () => void;
  onShowHelp: () => void;
  canSaveLoops: boolean;
  loopsOpen: boolean;
  loopsDirty: boolean;
  savedLoops: SavedLoop[];
  selectedLoopId: string | null;
  onToggleLoopsPopover: () => void;
  onSaveAsNew: (name: string) => void;
  onUpdateSelected: () => void;
  onApplyLoop: (id: string) => void;
  onReplaceLoop: (id: string) => void;
  onRenameLoop: (id: string, name: string) => void;
  onDeleteLoop: (id: string) => void;
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

// 1 → "1×", 1.5 → "1.5×", 0.25 → "0.25×".
const formatRate = (rate: number) => `${Number(rate.toFixed(2))}×`;

export function LoopPanel({
  enabled,
  mode,
  zoomed,
  playbackRate,
  onToggleEnabled,
  onToggleMode,
  onToggleZoom,
  onSpeedDown,
  onSpeedUp,
  onResetSpeed,
  onShowHelp,
  canSaveLoops,
  loopsOpen,
  loopsDirty,
  savedLoops,
  selectedLoopId,
  onToggleLoopsPopover,
  onSaveAsNew,
  onUpdateSelected,
  onApplyLoop,
  onReplaceLoop,
  onRenameLoop,
  onDeleteLoop
}: Props) {
  const atMin = playbackRate <= MIN_PLAYBACK_RATE;
  const atMax = playbackRate >= MAX_PLAYBACK_RATE;
  const modified = playbackRate !== 1;
  // Brief pulse so a reset click reads as a deliberate snap back to 1×.
  const [pulse, setPulse] = useState(false);

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
            disabled={!enabled}
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

      <div
        className="you-loop-speed"
        role="group"
        aria-label="Playback speed"
        data-disabled={!enabled}
      >
        <button
          type="button"
          className="you-loop-speed-step"
          aria-label="Decrease speed"
          disabled={!enabled || atMin}
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(event) => {
            swallow(event);
            onSpeedDown();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M6 12h12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className="you-loop-speed-value"
          aria-label={
            modified
              ? `Playback speed ${formatRate(playbackRate)}, click to reset to 1×`
              : `Playback speed ${formatRate(playbackRate)}`
          }
          title={modified ? "Reset to 1×" : undefined}
          data-modified={modified}
          data-pulse={pulse}
          disabled={!enabled || !modified}
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(event) => {
            swallow(event);
            if (!modified) return;
            onResetSpeed();
            setPulse(true);
          }}
          onAnimationEnd={() => setPulse(false)}
        >
          <span className="you-loop-speed-num">
            {Number(playbackRate.toFixed(2))}
            <span className="you-loop-speed-x">×</span>
          </span>
          <span className="you-loop-speed-reset" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M5.5 9.5a7 7 0 1 1-1.1 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M3 6.5v3.5h3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        <button
          type="button"
          className="you-loop-speed-step"
          aria-label="Increase speed"
          disabled={!enabled || atMax}
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(event) => {
            swallow(event);
            onSpeedUp();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M12 6v12M6 12h12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={zoomed}
        aria-label={zoomed ? "Hide loop zoom timeline" : "Show loop zoom timeline"}
        className="you-loop-zoom-toggle"
        data-on={zoomed}
        data-disabled={!enabled}
        disabled={!enabled}
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={(event) => {
          swallow(event);
          onToggleZoom();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="10.5"
            cy="10.5"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <path
            d="M15 15l4.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="you-loop-loops">
        <button
          type="button"
          className="you-loop-loops-toggle"
          aria-haspopup="dialog"
          aria-expanded={loopsOpen}
          aria-label="Saved loops"
          data-dirty={loopsDirty}
          disabled={!canSaveLoops}
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(event) => {
            swallow(event);
            onToggleLoopsPopover();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M7 4h10v16l-5-3.5L7 20z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {loopsOpen && canSaveLoops && (
          <SavedLoopsPopover
            loops={savedLoops}
            selectedId={selectedLoopId}
            dirty={loopsDirty}
            onSaveAsNew={onSaveAsNew}
            onUpdateSelected={onUpdateSelected}
            onApply={onApplyLoop}
            onReplace={onReplaceLoop}
            onRename={onRenameLoop}
            onDelete={onDeleteLoop}
          />
        )}
      </div>

      <button
        type="button"
        className="you-loop-help-toggle"
        aria-haspopup="dialog"
        aria-label="Show help"
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={(event) => {
          swallow(event);
          onShowHelp();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 11v5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="7.6" r="1.05" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
