import { act } from "react";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ZoomTimeline } from "./ZoomTimeline";

// jsdom lacks PointerEvent; a MouseEvent subclass carries clientX/pointerId/shiftKey.
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

function makeVideo() {
  return {
    currentTime: 25,
    paused: true,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLVideoElement;
}

function setup() {
  const video = makeVideo();
  const onLoopChange = vi.fn();
  const onWindowMove = vi.fn();

  render(
    <ZoomTimeline
      video={video}
      window={{ start: 20, end: 40 }}
      loop={{ start: 25, end: 30 }}
      onLoopChange={onLoopChange}
      onWindowMove={onWindowMove}
    />
  );

  // The zoom track is ref'd via trackRef; timeFromPointer reads its bounding rect.
  // Stub it so 1px == 1s within the window [20,40] (20s span over 20px width).
  const track = document.querySelector(".you-loop-zoom-track") as HTMLElement;
  track.getBoundingClientRect = () =>
    ({ left: 0, width: 20, top: 0, height: 30, right: 20, bottom: 30, x: 0, y: 0, toJSON() {} }) as DOMRect;

  const startCursor = screen.getByRole("button", { name: "Loop start" }) as HTMLElement;
  const endCursor = screen.getByRole("button", { name: "Loop end" }) as HTMLElement;

  // jsdom lacks setPointerCapture; stub it on the cursor buttons.
  startCursor.setPointerCapture = () => {};
  endCursor.setPointerCapture = () => {};

  // Also stub setPointerCapture on the track (for scrub tests).
  track.setPointerCapture = () => {};

  return { video, onLoopChange, onWindowMove, track, startCursor, endCursor };
}

describe("ZoomTimeline Shift+cursor drag (window mode)", () => {
  it("Shift+drag on start cursor slides the whole loop by the drag delta, length preserved — calls onWindowMove", () => {
    const { onWindowMove, onLoopChange, startCursor } = setup();

    // window = [20,40], loop = [25,30]. Rect: left=0, width=20 (1px=1s in win span).
    // Grab at clientX=5 → timeFromPointer(5) = 20 + (5/20)*20 = 25 (= loop.start)
    // Move to clientX=8 → timeFromPointer(8) = 20 + (8/20)*20 = 28 → delta = +3
    // translated: [25+3, 30+3] = [28, 33]
    act(() => {
      fireEvent.pointerDown(startCursor, { pointerId: 1, clientX: 5, shiftKey: true });
      fireEvent.pointerMove(startCursor, { pointerId: 1, clientX: 8, shiftKey: true });
      fireEvent.pointerUp(startCursor, { pointerId: 1, clientX: 8, shiftKey: true });
    });

    expect(onWindowMove).toHaveBeenCalledTimes(1);
    const result = onWindowMove.mock.calls[0][0];
    expect(result.start).toBeCloseTo(28, 2);
    expect(result.end).toBeCloseTo(33, 2);
    // length preserved
    expect(result.end - result.start).toBeCloseTo(5, 2);
    expect(onLoopChange).not.toHaveBeenCalled();
  });

  it("Shift+drag on end cursor also slides the whole loop — calls onWindowMove", () => {
    const { onWindowMove, onLoopChange, endCursor } = setup();

    // Grab at clientX=10 → timeFromPointer(10) = 20 + (10/20)*20 = 30 (= loop.end)
    // Move to clientX=12 → 32 → delta = +2
    // translated: [25+2, 30+2] = [27, 32]
    act(() => {
      fireEvent.pointerDown(endCursor, { pointerId: 1, clientX: 10, shiftKey: true });
      fireEvent.pointerMove(endCursor, { pointerId: 1, clientX: 12, shiftKey: true });
      fireEvent.pointerUp(endCursor, { pointerId: 1, clientX: 12, shiftKey: true });
    });

    expect(onWindowMove).toHaveBeenCalledTimes(1);
    const result = onWindowMove.mock.calls[0][0];
    expect(result.start).toBeCloseTo(27, 2);
    expect(result.end).toBeCloseTo(32, 2);
    expect(result.end - result.start).toBeCloseTo(5, 2);
    expect(onLoopChange).not.toHaveBeenCalled();
  });

  it("Shift+drag clamps the window flush at the zoom window end, keeping length", () => {
    const { onWindowMove, onLoopChange, startCursor } = setup();

    // loop=[25,30] len=5. max start in win=[20,40] → maxStart = 40-5 = 35.
    // Grab at clientX=5 (time=25). Move to clientX=100 (clamped to right=20 → time=40).
    // delta = 40-25 = 15. clamped start = min(35, max(20, 25+15)) = min(35,40) = 35.
    // result = [35, 40]
    act(() => {
      fireEvent.pointerDown(startCursor, { pointerId: 1, clientX: 5, shiftKey: true });
      fireEvent.pointerMove(startCursor, { pointerId: 1, clientX: 100, shiftKey: true });
      fireEvent.pointerUp(startCursor, { pointerId: 1, clientX: 100, shiftKey: true });
    });

    expect(onWindowMove).toHaveBeenCalledTimes(1);
    const result = onWindowMove.mock.calls[0][0];
    expect(result.start).toBeCloseTo(35, 2);
    expect(result.end).toBeCloseTo(40, 2);
    expect(onLoopChange).not.toHaveBeenCalled();
  });

  it("Shift+drag with no movement calls onLoopChange, not onWindowMove", () => {
    const { onWindowMove, onLoopChange, startCursor } = setup();

    act(() => {
      fireEvent.pointerDown(startCursor, { pointerId: 1, clientX: 5, shiftKey: true });
      // No pointermove — grab and release at the same spot.
      fireEvent.pointerUp(startCursor, { pointerId: 1, clientX: 5, shiftKey: true });
    });

    expect(onLoopChange).toHaveBeenCalledTimes(1);
    // Committed unchanged: a zero-delta window drag yields the original loop.
    expect(onLoopChange.mock.calls[0][0]).toEqual({ start: 25, end: 30 });
    expect(onWindowMove).not.toHaveBeenCalled();
  });
});

describe("ZoomTimeline plain cursor drag (resize mode)", () => {
  it("plain start cursor drag calls onLoopChange, never onWindowMove", () => {
    const { onWindowMove, onLoopChange, startCursor } = setup();

    act(() => {
      fireEvent.pointerDown(startCursor, { pointerId: 1, clientX: 5 });
      fireEvent.pointerMove(startCursor, { pointerId: 1, clientX: 3 });
      fireEvent.pointerUp(startCursor, { pointerId: 1, clientX: 3 });
    });

    expect(onLoopChange).toHaveBeenCalled();
    expect(onWindowMove).not.toHaveBeenCalled();
  });

  it("plain end cursor drag calls onLoopChange, never onWindowMove", () => {
    const { onWindowMove, onLoopChange, endCursor } = setup();

    act(() => {
      fireEvent.pointerDown(endCursor, { pointerId: 1, clientX: 10 });
      fireEvent.pointerMove(endCursor, { pointerId: 1, clientX: 15 });
      fireEvent.pointerUp(endCursor, { pointerId: 1, clientX: 15 });
    });

    expect(onLoopChange).toHaveBeenCalled();
    expect(onWindowMove).not.toHaveBeenCalled();
  });
});
