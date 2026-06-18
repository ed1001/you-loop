import { act } from "react";
import { render } from "@testing-library/react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineHandles } from "./TimelineHandles";

// jsdom lacks PointerEvent; a MouseEvent subclass carries clientX/pointerId.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    shiftKey: boolean;
    constructor(type: string, init: PointerEventInit & { shiftKey?: boolean } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.shiftKey = init.shiftKey ?? false;
    }
  }
  // @ts-expect-error test shim
  window.PointerEvent = PointerEventShim;
}

function setup() {
  const onSegmentChange = vi.fn();
  const onWindowMove = vi.fn();
  render(
    <TimelineHandles
      duration={120}
      segment={{ start: 20, end: 40 }}
      onSegmentChange={onSegmentChange}
      onWindowMove={onWindowMove}
    />
  );
  const timeline = screen.getByTestId("timeline-handles") as HTMLElement;
  // 1px == 1s.
  timeline.getBoundingClientRect = () =>
    ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const startHandle = screen.getByLabelText("Loop start") as HTMLElement;
  const endHandle = screen.getByLabelText("Loop end") as HTMLElement;
  // jsdom lacks setPointerCapture; stub it on the handles.
  startHandle.setPointerCapture = () => {};
  endHandle.setPointerCapture = () => {};
  return { onSegmentChange, onWindowMove, timeline, startHandle, endHandle };
}

describe("TimelineHandles Shift+handle drag (window mode)", () => {
  it("Shift+drag on start handle slides the whole window by the drag delta, length preserved — calls onWindowMove", () => {
    const { onWindowMove, onSegmentChange, startHandle } = setup();
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 30, shiftKey: true });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 50, shiftKey: true }); // +20s
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 50, shiftKey: true });
    });
    // start changed 20→40, length preserved (20s), so onWindowMove is called.
    expect(onWindowMove).toHaveBeenLastCalledWith({ start: 40, end: 60 });
    expect(onSegmentChange).not.toHaveBeenCalled();
  });

  it("Shift+drag on end handle also slides the whole window — calls onWindowMove", () => {
    const { onWindowMove, onSegmentChange, endHandle } = setup();
    act(() => {
      fireEvent.pointerDown(endHandle, { pointerId: 1, clientX: 30, shiftKey: true });
      fireEvent.pointerMove(endHandle, { pointerId: 1, clientX: 50, shiftKey: true }); // +20s
      fireEvent.pointerUp(endHandle, { pointerId: 1, clientX: 50, shiftKey: true });
    });
    // start changed 20→40, length preserved (20s), so onWindowMove is called.
    expect(onWindowMove).toHaveBeenLastCalledWith({ start: 40, end: 60 });
    expect(onSegmentChange).not.toHaveBeenCalled();
  });

  it("Shift+drag clamps the window flush at the timeline end, keeping length — calls onWindowMove", () => {
    const { onWindowMove, onSegmentChange, startHandle } = setup();
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 30, shiftKey: true });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 200, shiftKey: true }); // way past end
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 200, shiftKey: true });
    });
    // start changed 20→100 (clamped), length preserved (20s).
    expect(onWindowMove).toHaveBeenLastCalledWith({ start: 100, end: 120 });
    expect(onSegmentChange).not.toHaveBeenCalled();
  });

  it("Shift+drag with no movement calls onSegmentChange, not onWindowMove", () => {
    const { onWindowMove, onSegmentChange, startHandle } = setup();
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 30, shiftKey: true });
      // No pointermove — grab and release at the same spot.
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 30, shiftKey: true });
    });
    // start did not change, so onSegmentChange is called (no seek).
    expect(onSegmentChange).toHaveBeenLastCalledWith({ start: 20, end: 40 });
    expect(onWindowMove).not.toHaveBeenCalled();
  });
});

describe("TimelineHandles plain handle drag (resize mode)", () => {
  it("plain start handle drag calls onSegmentChange, never onWindowMove", () => {
    const { onWindowMove, onSegmentChange, startHandle } = setup();
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 20 });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 10 });
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 10 });
    });
    expect(onSegmentChange).toHaveBeenCalled();
    expect(onWindowMove).not.toHaveBeenCalled();
  });

  it("plain end handle drag calls onSegmentChange, never onWindowMove", () => {
    const { onWindowMove, onSegmentChange, endHandle } = setup();
    act(() => {
      fireEvent.pointerDown(endHandle, { pointerId: 1, clientX: 40 });
      fireEvent.pointerMove(endHandle, { pointerId: 1, clientX: 60 });
      fireEvent.pointerUp(endHandle, { pointerId: 1, clientX: 60 });
    });
    expect(onSegmentChange).toHaveBeenCalled();
    expect(onWindowMove).not.toHaveBeenCalled();
  });
});
