import { useState } from "react";
import { PLAYBACK_RATE_STEP } from "../playback/reducer";
import type { PlaybackCommand, PlaybackState } from "../playback/types";
import { TimelineHandles } from "./TimelineHandles";
import { ZoomPanel } from "./ZoomPanel";
import "./overlay.css";

type Props = {
  duration: number;
  state: PlaybackState;
  dispatch: (command: PlaybackCommand) => void;
};

export function PlayerOverlay({ duration, state, dispatch }: Props) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const nextRate = Number((state.playbackRate + PLAYBACK_RATE_STEP).toFixed(2));
  const previousRate = Number(
    (state.playbackRate - PLAYBACK_RATE_STEP).toFixed(2)
  );

  return (
    <div className="you-loop-overlay" aria-label="You Loop controls">
      {zoomOpen && (
        <ZoomPanel
          duration={duration}
          segment={state.loopSegment}
          onSegmentChange={(segment) =>
            dispatch({ type: "setLoopSegment", segment })
          }
        />
      )}
      <TimelineHandles
        duration={duration}
        segment={state.loopSegment}
        onSegmentChange={(segment) =>
          dispatch({ type: "setLoopSegment", segment })
        }
      />
      <div className="you-loop-controls">
        <button
          aria-label={`${state.playMode === "loop" ? "Loop" : "One-shot"} mode`}
          onClick={() =>
            dispatch({
              type: "setPlayMode",
              mode: state.playMode === "loop" ? "one-shot" : "loop"
            })
          }
        >
          {state.playMode === "loop" ? "Loop" : "One-shot"}
        </button>
        <button aria-label="Zoom" onClick={() => setZoomOpen((open) => !open)}>
          Zoom
        </button>
        <button
          aria-label="Decrease speed"
          onClick={() =>
            dispatch({ type: "setPlaybackRate", rate: previousRate })
          }
        >
          -
        </button>
        <button
          aria-label="Reset speed"
          onClick={() => dispatch({ type: "resetPlaybackRate" })}
        >
          {state.playbackRate}x
        </button>
        <button
          aria-label="Increase speed"
          onClick={() => dispatch({ type: "setPlaybackRate", rate: nextRate })}
        >
          +
        </button>
        <button aria-label="Clear loop" onClick={() => dispatch({ type: "clearLoop" })}>
          Clear
        </button>
      </div>
    </div>
  );
}
