import type { MouseEvent, PointerEvent } from "react";

type Props = {
  enabled: boolean;
  onToggle: () => void;
};

// YouTube binds mouse/pointer handlers on the progress bar; this control is a
// descendant of it, so swallow those events to avoid scrubbing the video.
const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function LoopSwitch({ enabled, onToggle }: Props) {
  return (
    <div className="you-loop-panel">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Loop"
        className="you-loop-switch"
        data-on={enabled}
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={(event) => {
          swallow(event);
          onToggle();
        }}
      >
        <span className="you-loop-switch-track" aria-hidden="true">
          <span className="you-loop-switch-thumb" />
        </span>
        <span className="you-loop-switch-label">Loop</span>
      </button>
    </div>
  );
}
