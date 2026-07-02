import type { MouseEvent, PointerEvent } from "react";
import type { LoopSegment, PlayMode } from "../playback/types";
import { SpeedControl } from "./SpeedControl";
import { PitchControl } from "./PitchControl";
import type { PitchSettings } from "../persistence/pitchStore";
import { SavedLoopsModal } from "./SavedLoopsModal";
import { EtudeWordmark } from "./EtudeWordmark";
import type { SavedLoop } from "../persistence/loopStore";
import { CountInControl } from "./CountInControl";
import type { CountInSettings } from "../persistence/countInStore";

type Props = {
  enabled: boolean;
  mode: PlayMode;
  zoomed: boolean;
  playbackRate: number;
  onToggleEnabled: () => void;
  onToggleMode: () => void;
  onToggleZoom: () => void;
  onSpeedChange: (rate: number) => void;
  onResetSpeed: () => void;
  pitchSettings: PitchSettings;
  pitchAvailable: boolean;
  onPitchChange: (settings: PitchSettings) => void;
  onResetPitch: () => void;
  onShowHelp: () => void;
  canSaveLoops: boolean;
  loopsContainer: HTMLElement | null;
  loopsOpen: boolean;
  savedLoops: SavedLoop[];
  selectedLoopId: string | null;
  currentSegment: LoopSegment | null;
  loopDirty: boolean;
  sourceLoop?: SavedLoop;
  duration: number;
  currentZoom: LoopSegment | null;
  currentCountIn: CountInSettings;
  onToggleLoops: () => void;
  onCloseLoops: () => void;
  onSaveAsNew: (name: string) => void;
  onUpdateLoop: (id: string) => void;
  onApplyLoop: (id: string) => void;
  onDeleteLoop: (id: string) => void;
  countInOn: boolean;
  countInSettings: CountInSettings;
  onToggleCountIn: () => void;
  onCountInSettingsChange: (next: CountInSettings) => void;
};

// YouTube binds mouse/pointer handlers on the progress bar; these controls are
// descendants of it, so swallow those events to avoid scrubbing the video.
const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

// Hovering the panel must not bubble into YouTube's scrubber (it would pop the
// timeline preview). Stop move/hover events without preventDefault so the
// panel's own hover styles still work.
const swallowMove = (event: MouseEvent | PointerEvent) => {
  event.stopPropagation();
};

const MODES: { value: PlayMode; label: string }[] = [
  { value: "loop", label: "Loop" },
  { value: "one-shot", label: "One-shot" }
];

export function LoopPanel({
  enabled,
  mode,
  zoomed,
  playbackRate,
  onToggleEnabled,
  onToggleMode,
  onToggleZoom,
  onSpeedChange,
  onResetSpeed,
  pitchSettings,
  pitchAvailable,
  onPitchChange,
  onResetPitch,
  onShowHelp,
  canSaveLoops,
  loopsContainer,
  loopsOpen,
  savedLoops,
  selectedLoopId,
  currentSegment,
  loopDirty,
  sourceLoop,
  duration,
  currentZoom,
  currentCountIn,
  onToggleLoops,
  onCloseLoops,
  onSaveAsNew,
  onUpdateLoop,
  onApplyLoop,
  onDeleteLoop,
  countInOn,
  countInSettings,
  onToggleCountIn,
  onCountInSettingsChange
}: Props) {
  return (
    <>
    <div
      className="you-loop-panel"
      data-on={enabled}
      onPointerMove={swallowMove}
      onMouseMove={swallowMove}
      onMouseOver={swallowMove}
      onMouseOut={swallowMove}
      // Dead zones in the panel (logo, padding) sit over YouTube's progress
      // bar; without this a click there bleeds through and seeks the video.
      // Interactive children swallow their own events, so this only catches the
      // gaps between them.
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={swallow}
    >
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

      {/* The spacer and control cluster sum their widths: spacer open when off,
          controls open when on. Because the two widths add (rather than a
          min-width racing the content), the pill resizes monotonically with no
          bounce in either direction. */}
      <div className="you-loop-center">
        <div className="you-loop-wordmark-slot" aria-hidden="true" />

        <div className="you-loop-cluster">
          <div className="you-loop-cluster-inner">
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

            <button
              type="button"
              className="you-loop-mode-compact"
              data-mode={mode}
              data-disabled={!enabled}
              disabled={!enabled}
              aria-label={
                mode === "loop" ? "Switch to one-shot" : "Switch to loop"
              }
              onPointerDown={swallow}
              onMouseDown={swallow}
              onClick={(event) => {
                swallow(event);
                onToggleMode();
              }}
            >
              {mode === "loop" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M5 9a4 4 0 0 1 4-4h7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13 2.5 16.5 5 13 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 15a4 4 0 0 1-4 4H8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M11 21.5 7.5 19 11 16.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M4 12h14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M14 7l5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>

            <SpeedControl
              rate={playbackRate}
              disabled={!enabled}
              container={loopsContainer}
              onRateChange={onSpeedChange}
              onReset={onResetSpeed}
            />

            <PitchControl
              settings={pitchSettings}
              available={pitchAvailable}
              disabled={!enabled}
              container={loopsContainer}
              onChange={onPitchChange}
              onReset={onResetPitch}
            />

            <button
              type="button"
              role="switch"
              aria-checked={zoomed}
              aria-label={
                zoomed ? "Hide loop zoom timeline" : "Show loop zoom timeline"
              }
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
  
            <CountInControl
              enabled={enabled}
              on={countInOn}
              settings={countInSettings}
              container={loopsContainer}
              disabled={!enabled}
              onToggle={onToggleCountIn}
              onSettingsChange={onCountInSettingsChange}
            />

            <button
              type="button"
              className="you-loop-loops-toggle"
              aria-haspopup="dialog"
              aria-expanded={loopsOpen}
              aria-label="Saved loops"
              disabled={!canSaveLoops}
              onPointerDown={swallow}
              onMouseDown={swallow}
              onClick={(event) => {
                swallow(event);
                onToggleLoops();
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
          </div>
        </div>
      </div>

      <SavedLoopsModal
        open={loopsOpen && canSaveLoops}
        container={loopsContainer}
        loops={savedLoops}
        selectedId={selectedLoopId}
        currentSegment={currentSegment}
        dirty={loopDirty}
        sourceLoop={sourceLoop}
        duration={duration}
        currentZoom={currentZoom}
        currentCountIn={currentCountIn}
        onClose={onCloseLoops}
        onSaveAsNew={onSaveAsNew}
        onUpdateLoop={onUpdateLoop}
        onApply={onApplyLoop}
        onDelete={onDeleteLoop}
      />

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

    {/* The wordmark lives OUTSIDE the pill, anchored to the page-ui overlay
        (whose width never animates) at the pill's fixed center. Inside the
        pill, `left: 50%` re-resolves against the animating width every frame
        and the sub-pixel rounding makes the text shimmer; out here its
        position is computed once, so it is perfectly still and only fades.
        Rendered after the pill so it paints on top of the pill background;
        its footprint inside the pill is reserved by the spacer slot above. */}
    <span className="you-loop-wordmark" data-on={enabled} aria-hidden="true">
      <EtudeWordmark />
    </span>
    </>
  );
}
