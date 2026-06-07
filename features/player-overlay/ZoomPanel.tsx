import type { LoopSegment } from "../playback/types";
import { TimelineHandles } from "./TimelineHandles";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
};

export function ZoomPanel({ duration, segment, onSegmentChange }: Props) {
  return (
    <div className="you-loop-zoom-panel" data-testid="zoom-panel">
      <div className="you-loop-waveform" aria-hidden="true">
        {Array.from({ length: 48 }, (_, index) => (
          <span key={index} style={{ height: `${20 + ((index * 17) % 55)}%` }} />
        ))}
      </div>
      <TimelineHandles
        duration={duration}
        segment={segment}
        onSegmentChange={onSegmentChange}
      />
    </div>
  );
}
