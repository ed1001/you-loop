import type { LoopSegment } from "../playback/types";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
};

export function TimelineHandles({ duration, segment, onSegmentChange }: Props) {
  const safeDuration = Math.max(duration, 1);
  const current = segment ?? {
    start: safeDuration * 0.25,
    end: safeDuration * 0.5
  };
  const startPercent = (current.start / safeDuration) * 100;
  const endPercent = (current.end / safeDuration) * 100;

  return (
    <div className="you-loop-timeline" data-testid="timeline-handles">
      <input
        aria-label="Loop start"
        type="range"
        min={0}
        max={safeDuration}
        step={0.1}
        value={current.start}
        onChange={(event) =>
          onSegmentChange({
            start: Number(event.currentTarget.value),
            end: current.end
          })
        }
      />
      <input
        aria-label="Loop end"
        type="range"
        min={0}
        max={safeDuration}
        step={0.1}
        value={current.end}
        onChange={(event) =>
          onSegmentChange({
            start: current.start,
            end: Number(event.currentTarget.value)
          })
        }
      />
      <div
        className="you-loop-selected-range"
        style={{
          left: `${startPercent}%`,
          width: `${endPercent - startPercent}%`
        }}
      />
    </div>
  );
}
