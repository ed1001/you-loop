import { act } from "react";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoomTimeline } from "./ZoomTimeline";

// suppressNextClick() arms a one-shot window click listener cleaned up either
// by a real click or a setTimeout(0) safety net. In real usage the browser's
// synthesized click follows synchronously in the same gesture; tests that
// pointerdown+pointerup a drag without also firing that click leave the
// listener armed past the test. Flush real timers between tests so it never
// bleeds into an unrelated click assertion in a later test.
afterEach(() => new Promise((resolve) => setTimeout(resolve, 0)));

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

function setup(extra: Partial<Parameters<typeof ZoomTimeline>[0]> = {}) {
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
      {...extra}
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
  it("shows a precise time chip on the dragged cursor and hides it on release", () => {
    const { startCursor } = setup();

    // window = [20,40], 1px == 1s. Drag the start cursor to clientX=6 → 26s.
    act(() => {
      fireEvent.pointerDown(startCursor, { pointerId: 1, clientX: 5 });
      fireEvent.pointerMove(startCursor, { pointerId: 1, clientX: 6 });
    });
    expect(startCursor.dataset.dragLive).toBe("true");
    expect(
      startCursor.querySelector(".you-loop-handle-chip")?.textContent
    ).toBe("0:26.0");

    act(() => {
      fireEvent.pointerUp(startCursor, { pointerId: 1, clientX: 6 });
    });
    expect(startCursor.dataset.dragLive).toBeUndefined();
  });

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

describe("ZoomTimeline count-in beacon", () => {
  const renderWithCountIn = (countIn: Parameters<typeof ZoomTimeline>[0]["countIn"]) =>
    render(
      <ZoomTimeline
        video={makeVideo()}
        window={{ start: 20, end: 40 }}
        loop={{ start: 25, end: 30 }}
        onLoopChange={vi.fn()}
        countIn={countIn}
      />
    );

  it("renders nothing without a count in progress", () => {
    renderWithCountIn(null);
    expect(screen.queryByTestId("countin-beacon")).toBeNull();
  });

  it("positions the beacon within the zoom window and shows the beat numeral", () => {
    renderWithCountIn({ timeSec: 25, beatIndex: 1, beatsPerBar: 4, session: 1 });
    const beacon = screen.getByTestId("countin-beacon");
    expect(beacon.textContent).toBe("2");
    // 25s in the 20–40s window → 25% across the strip.
    expect(parseFloat(beacon.style.left)).toBeCloseTo(25, 6);
  });
});

describe("ZoomTimeline practice marks", () => {
  it("shift+pointerdown on the track adds a mark at the pointer time and does not scrub", () => {
    const onAddMark = vi.fn();
    const { video, track } = setup({ marks: [], onAddMark });

    // 1px == 1s in the [20,40] window; clientX=7 → 27s.
    act(() => {
      fireEvent.pointerDown(track, { pointerId: 1, clientX: 7, shiftKey: true });
    });

    expect(onAddMark).toHaveBeenCalledWith(27);
    expect(video.pause).not.toHaveBeenCalled(); // scrub path pauses; add must not
  });

  it("plain pointerdown on the track still scrubs", () => {
    const onAddMark = vi.fn();
    const { video, track } = setup({ marks: [], onAddMark });

    act(() => {
      fireEvent.pointerDown(track, { pointerId: 1, clientX: 7 });
      fireEvent.pointerUp(track, { pointerId: 1, clientX: 7 });
    });

    expect(onAddMark).not.toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
  });

  it("renders markers at their window position with active/inert state", () => {
    // loop = [25,30]: 26 live, 24 inert (before start), 29.95 inert (tail).
    setup({ marks: [24, 26, 29.95], activeMark: 26 });

    const live = screen.getByRole("button", { name: "Practice mark at 0:26" });
    expect(live.dataset.active).toBe("true");
    expect(live.dataset.inert).toBeUndefined();
    // 26s in [20,40] → 30% across the strip.
    expect(parseFloat(live.style.left)).toBeCloseTo(30, 5);

    const before = screen.getByRole("button", { name: "Practice mark at 0:24" });
    expect(before.dataset.inert).toBe("true");
    const tail = screen.getByRole("button", { name: /0:29/ });
    expect(tail.dataset.inert).toBe("true");
  });

  it("does not render marks outside the zoom window", () => {
    setup({ marks: [10, 26] }); // 10s is outside [20,40]
    expect(screen.queryByRole("button", { name: "Practice mark at 0:10" })).toBeNull();
    expect(screen.getByRole("button", { name: "Practice mark at 0:26" })).toBeInTheDocument();
  });

  it("click toggles, shift+click removes", () => {
    const onToggleMark = vi.fn();
    const onRemoveMark = vi.fn();
    setup({ marks: [26], onToggleMark, onRemoveMark });

    const mark = screen.getByRole("button", { name: "Practice mark at 0:26" });
    fireEvent.click(mark);
    expect(onToggleMark).toHaveBeenCalledWith(26);
    expect(onRemoveMark).not.toHaveBeenCalled();

    fireEvent.click(mark, { shiftKey: true });
    expect(onRemoveMark).toHaveBeenCalledWith(26);
    expect(onToggleMark).toHaveBeenCalledTimes(1);
  });

  it("pressing a marker does not start a track scrub", () => {
    const { video } = setup({ marks: [26] });
    const mark = screen.getByRole("button", { name: "Practice mark at 0:26" });
    act(() => {
      fireEvent.pointerDown(mark, { pointerId: 1, clientX: 6 });
    });
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("draws the drill fill from the active mark to the loop end", () => {
    setup({ marks: [26], activeMark: 26 });
    const fill = document.querySelector(".you-loop-zoom-drill-fill") as HTMLElement;
    expect(fill).not.toBeNull();
    // 26→30 in [20,40]: left 30%, width 20%.
    expect(parseFloat(fill.style.left)).toBeCloseTo(30, 5);
    expect(parseFloat(fill.style.width)).toBeCloseTo(20, 5);
  });

  it("draws no drill fill when the active mark is inert", () => {
    setup({ marks: [24], activeMark: 24 });
    expect(document.querySelector(".you-loop-zoom-drill-fill")).toBeNull();
  });
});

describe("ZoomTimeline shift-hover cursor flag", () => {
  it("mirrors held Shift into data-shift on the track and clears on release", () => {
    const { track } = setup();

    act(() => {
      fireEvent.keyDown(window, { key: "Shift" });
    });
    expect(track.dataset.shift).toBe("true");

    act(() => {
      fireEvent.keyUp(window, { key: "Shift" });
    });
    expect(track.dataset.shift).toBeUndefined();
  });

  it("clears the flag when the window loses focus with Shift held", () => {
    const { track } = setup();

    act(() => {
      fireEvent.keyDown(window, { key: "Shift" });
    });
    expect(track.dataset.shift).toBe("true");

    act(() => {
      fireEvent.blur(window);
    });
    expect(track.dataset.shift).toBeUndefined();
  });
});
