import { act } from "react";
import { render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineHandles } from "./TimelineHandles";

// jsdom lacks PointerEvent; a MouseEvent subclass carries clientX/pointerId.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  // @ts-expect-error test shim
  window.PointerEvent = PointerEventShim;
}

function setup() {
  const onSegmentChange = vi.fn();
  const onWindowMove = vi.fn();
  const utils = render(
    <TimelineHandles
      duration={120}
      segment={{ start: 20, end: 40 }}
      onSegmentChange={onSegmentChange}
      onWindowMove={onWindowMove}
    />
  );
  const timeline = utils.getByTestId("timeline-handles") as HTMLElement;
  // 1px == 1s.
  timeline.getBoundingClientRect = () =>
    ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const band = timeline.querySelector(".you-loop-loop-range") as HTMLElement;
  const startHandle = timeline.querySelector("[aria-label='Loop start']") as HTMLElement;
  const endHandle = timeline.querySelector("[aria-label='Loop end']") as HTMLElement;
  return { onSegmentChange, onWindowMove, timeline, band, startHandle, endHandle };
}

describe("TimelineHandles band drag", () => {
  it("slides the whole window by the drag delta, length preserved — calls onWindowMove", () => {
    const { onWindowMove, onSegmentChange, band } = setup();
    band.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(band, { pointerId: 1, clientX: 30 }); // grab at t=30
      fireEvent.pointerMove(band, { pointerId: 1, clientX: 50 }); // +20s
      fireEvent.pointerUp(band, { pointerId: 1, clientX: 50 });
    });
    // The window moved (start changed 20→40), so onWindowMove is called, not onSegmentChange.
    expect(onWindowMove).toHaveBeenLastCalledWith({ start: 40, end: 60 });
    expect(onSegmentChange).not.toHaveBeenCalled();
  });

  it("clamps the window flush at the timeline end, keeping length — calls onWindowMove", () => {
    const { onWindowMove, onSegmentChange, band } = setup();
    band.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(band, { pointerId: 1, clientX: 30 });
      fireEvent.pointerMove(band, { pointerId: 1, clientX: 200 }); // way past end
      fireEvent.pointerUp(band, { pointerId: 1, clientX: 200 });
    });
    // start changed 20→100, so onWindowMove is called.
    expect(onWindowMove).toHaveBeenLastCalledWith({ start: 100, end: 120 });
    expect(onSegmentChange).not.toHaveBeenCalled();
  });

  it("a band click with no movement calls onSegmentChange, not onWindowMove", () => {
    const { onWindowMove, onSegmentChange, band } = setup();
    band.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(band, { pointerId: 1, clientX: 30 });
      // No pointermove — grab and release at the same spot.
      fireEvent.pointerUp(band, { pointerId: 1, clientX: 30 });
    });
    // start did not change, so onSegmentChange is called (no seek).
    expect(onSegmentChange).toHaveBeenLastCalledWith({ start: 20, end: 40 });
    expect(onWindowMove).not.toHaveBeenCalled();
  });

  it("start handle drag calls onSegmentChange, never onWindowMove", () => {
    const { onWindowMove, onSegmentChange, startHandle } = setup();
    startHandle.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 20 });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 10 });
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 10 });
    });
    expect(onSegmentChange).toHaveBeenCalled();
    expect(onWindowMove).not.toHaveBeenCalled();
  });

  it("end handle drag calls onSegmentChange, never onWindowMove", () => {
    const { onWindowMove, onSegmentChange, endHandle } = setup();
    endHandle.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(endHandle, { pointerId: 1, clientX: 40 });
      fireEvent.pointerMove(endHandle, { pointerId: 1, clientX: 60 });
      fireEvent.pointerUp(endHandle, { pointerId: 1, clientX: 60 });
    });
    expect(onSegmentChange).toHaveBeenCalled();
    expect(onWindowMove).not.toHaveBeenCalled();
  });
});
