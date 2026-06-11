import { useLayoutEffect, useRef, type PointerEvent, type MouseEvent } from "react";
import type { LoopSegment } from "../playback/types";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
};

type Handle = "start" | "end";

export function TimelineHandles({ duration, segment, onSegmentChange }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const rangeRef = useRef<HTMLDivElement>(null);

  const safeDuration = Math.max(duration, 1);

  const committed = segment ?? {
    start: safeDuration * 0.25,
    end: safeDuration * 0.5
  };

  const startPercent = (committed.start / safeDuration) * 100;
  const endPercent = (committed.end / safeDuration) * 100;

  // The segment being dragged. Updated via direct DOM (no React render) every
  // pointermove so the handle tracks the cursor smoothly; committed to state
  // only on drop.
  const draggingRef = useRef<Handle | null>(null);
  const liveRef = useRef<LoopSegment>(committed);

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

  // Move the handles/range directly so dragging does not trigger a re-render.
  const paint = (seg: LoopSegment) => {
    const start = (seg.start / safeDuration) * 100;
    const end = (seg.end / safeDuration) * 100;

    if (startRef.current) startRef.current.style.left = `${start}%`;
    if (endRef.current) endRef.current.style.left = `${end}%`;
    if (rangeRef.current) {
      rangeRef.current.style.left = `${start}%`;
      rangeRef.current.style.width = `${end - start}%`;
    }
  };

  // Keep the range highlight synced with committed state (and resize).
  useLayoutEffect(() => {
    if (draggingRef.current == null) {
      paint(committed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed.start, committed.end, safeDuration]);

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
      liveRef.current = committed;
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (draggingRef.current !== handle) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const value = valueFromPointer(event.clientX);
      liveRef.current = clampSegment(handle, value, liveRef.current);
      paint(liveRef.current);
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
      const next = clampSegment(handle, value, liveRef.current);
      paint(next);
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
        ref={rangeRef}
        className="you-loop-loop-range"
        style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
      />
      <button
        ref={startRef}
        aria-label="Loop start"
        className="you-loop-handle"
        type="button"
        style={{ left: `${startPercent}%` }}
        {...createDragHandlers("start")}
      />
      <button
        ref={endRef}
        aria-label="Loop end"
        className="you-loop-handle"
        type="button"
        style={{ left: `${endPercent}%` }}
        {...createDragHandlers("end")}
      />
    </div>
  );
}
