import { useRef, useState, type PointerEvent, type MouseEvent } from "react";
import type { LoopSegment } from "../playback/types";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
};

type Handle = "start" | "end";

export function TimelineHandles({ duration, segment, onSegmentChange }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const safeDuration = Math.max(duration, 1);

  const committed = segment ?? {
    start: safeDuration * 0.25,
    end: safeDuration * 0.5
  };

  // Live segment while dragging so handles track the pointer every frame.
  const [draft, setDraft] = useState<LoopSegment | null>(null);
  const draggingRef = useRef<Handle | null>(null);

  const current = draft ?? committed;
  const startPercent = (current.start / safeDuration) * 100;
  const endPercent = (current.end / safeDuration) * 100;

  const valueFromPointer = (clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (rect == null || rect.width <= 0) {
      return 0;
    }

    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Number((percent * safeDuration).toFixed(2));
  };

  const clampSegment = (handle: Handle, value: number, from: LoopSegment): LoopSegment => {
    if (handle === "start") {
      return { start: Math.min(value, from.end), end: from.end };
    }
    return { start: from.start, end: Math.max(value, from.start) };
  };

  // Block YouTube's scrubber: it binds mousedown/click on the progress bar.
  const blockMouse = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const createDragHandlers = (handle: Handle) => ({
    onMouseDown: blockMouse,
    onClick: blockMouse,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingRef.current = handle;
      setDraft(committed);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (draggingRef.current !== handle) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const value = valueFromPointer(event.clientX);
      setDraft((prev) => clampSegment(handle, value, prev ?? committed));
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (draggingRef.current !== handle) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.releasePointerCapture(event.pointerId);
      draggingRef.current = null;

      const value = valueFromPointer(event.clientX);
      const next = clampSegment(handle, value, draft ?? committed);
      setDraft(null);
      onSegmentChange(next);
    }
  });

  return (
    <div
      ref={timelineRef}
      className="you-loop-timeline"
      data-testid="timeline-handles"
    >
      <div
        className="you-loop-loop-range"
        style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
      />
      <button
        aria-label="Loop start"
        className="you-loop-handle"
        type="button"
        style={{ left: `${startPercent}%` }}
        {...createDragHandlers("start")}
      />
      <button
        aria-label="Loop end"
        className="you-loop-handle"
        type="button"
        style={{ left: `${endPercent}%` }}
        {...createDragHandlers("end")}
      />
    </div>
  );
}
