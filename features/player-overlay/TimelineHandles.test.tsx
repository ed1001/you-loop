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
  const utils = render(
    <TimelineHandles
      duration={120}
      segment={{ start: 20, end: 40 }}
      onSegmentChange={onSegmentChange}
    />
  );
  const timeline = utils.getByTestId("timeline-handles") as HTMLElement;
  // 1px == 1s.
  timeline.getBoundingClientRect = () =>
    ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const band = timeline.querySelector(".you-loop-loop-range") as HTMLElement;
  return { onSegmentChange, timeline, band };
}

describe("TimelineHandles band drag", () => {
  it("slides the whole window by the drag delta, length preserved", () => {
    const { onSegmentChange, band } = setup();
    band.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(band, { pointerId: 1, clientX: 30 }); // grab at t=30
      fireEvent.pointerMove(band, { pointerId: 1, clientX: 50 }); // +20s
      fireEvent.pointerUp(band, { pointerId: 1, clientX: 50 });
    });
    expect(onSegmentChange).toHaveBeenLastCalledWith({ start: 40, end: 60 });
  });

  it("clamps the window flush at the timeline end, keeping length", () => {
    const { onSegmentChange, band } = setup();
    band.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(band, { pointerId: 1, clientX: 30 });
      fireEvent.pointerMove(band, { pointerId: 1, clientX: 200 }); // way past end
      fireEvent.pointerUp(band, { pointerId: 1, clientX: 200 });
    });
    expect(onSegmentChange).toHaveBeenLastCalledWith({ start: 100, end: 120 });
  });
});
