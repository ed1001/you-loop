import { act } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setPageUiVisible } from "./pageUi";
import { SAVED_STORE_KEY } from "../../features/persistence/loopStore";
import { LAUNCH_KEY } from "../../features/persistence/settingsStore";

function enableLoop() {
  fireEvent.click(screen.getByLabelText("Enable loop range"));
}

// jsdom has no PointerEvent; a MouseEvent subclass carries the clientX/Y and
// pointerId the speed scrubber reads, and the component guards
// setPointerCapture with ?.()
if (typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    movementX: number;
    movementY: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.movementX = init.movementX ?? 0;
      this.movementY = init.movementY ?? 0;
    }
  }
  // @ts-expect-error test shim
  window.PointerEvent = PointerEventShim;
}

function speedSlider() {
  return screen.getByRole("slider", { name: /playback speed/i });
}

// Mounts the player, switches the loop on, and hands back the speed slider —
// the shared setup for every speed-control test.
function mountSpeedControl() {
  const mounted = mountYouTubePlayer();
  act(() => {
    setPageUiVisible(mounted.player, true);
  });
  act(() => {
    enableLoop();
  });
  return { ...mounted, slider: speedSlider() };
}

// One scrub gesture: press at (100,100), visit each point, optionally release
// at the last point. All inside a single act, like a continuous real drag.
function scrub(
  slider: HTMLElement,
  moves: Array<{ x: number; y: number }>,
  opts: { pointerId?: number; release?: boolean } = {}
) {
  const { pointerId = 1, release = true } = opts;
  act(() => {
    fireEvent.pointerDown(slider, { pointerId, clientX: 100, clientY: 100 });
    for (const move of moves) {
      fireEvent.pointerMove(slider, {
        pointerId,
        clientX: move.x,
        clientY: move.y
      });
    }
    if (release) {
      const last = moves[moves.length - 1] ?? { x: 100, y: 100 };
      fireEvent.pointerUp(slider, { pointerId, clientX: last.x, clientY: last.y });
    }
  });
}

function mountYouTubePlayer() {
  const player = document.createElement("div");
  player.className = "html5-video-player";

  const video = document.createElement("video");
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: 120
  });

  const progressBar = document.createElement("div");
  progressBar.className = "ytp-progress-bar";

  player.append(video, progressBar);
  document.body.append(player);

  return { player, progressBar, video };
}

// In-memory browser.storage.local good enough for loadEntry/takeLaunch.
function stubBrowserStorage(initial: Record<string, unknown>) {
  let data: Record<string, unknown> = { ...initial };
  vi.stubGlobal("browser", {
    storage: {
      local: {
        async get(key: string) {
          return key in data ? { [key]: data[key] } : {};
        },
        async set(items: Record<string, unknown>) {
          data = { ...data, ...items };
        }
      }
    },
    runtime: { getURL: (p: string) => p }
  });
  return { dump: () => data };
}

describe("page UI", () => {
  afterEach(() => {
    // A scrub release arms a one-shot click trap (see suppressNextClick);
    // discharge it so it cannot leak into the next test's first click.
    fireEvent.click(document.body);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("mounts loop timeline handles in the player progress bar when enabled", () => {
    const { player } = mountYouTubePlayer();

    act(() => {
      setPageUiVisible(player, true);
    });

    // Handles stay hidden until the loop is switched on.
    expect(screen.queryByLabelText("Loop start")).not.toBeInTheDocument();

    act(() => {
      enableLoop();
    });

    expect(screen.getByLabelText("Loop start")).toBeInTheDocument();
    expect(screen.getByLabelText("Loop end")).toBeInTheDocument();
  });

  it("removes the timeline handles when disabled", () => {
    const { player } = mountYouTubePlayer();

    act(() => {
      setPageUiVisible(player, true);
    });
    act(() => {
      enableLoop();
    });

    expect(screen.getByLabelText("Loop start")).toBeInTheDocument();

    act(() => {
      setPageUiVisible(player, false);
    });

    expect(screen.queryByLabelText("Loop start")).not.toBeInTheDocument();
  });

  it("scrubs the playback rate by dragging the speed control vertically", () => {
    const { player, video, slider } = mountSpeedControl();

    // 40px up = 5 steps of 0.05 = +0.25.
    scrub(slider, [{ x: 100, y: 60 }], { release: false });
    expect(video.playbackRate).toBeCloseTo(1.25);
    // The tape popover is visible while scrubbing.
    expect(player.querySelector(".you-loop-speed-pop")).not.toBeNull();

    act(() => {
      fireEvent.pointerUp(slider, { pointerId: 1, clientX: 100, clientY: 60 });
    });
    // Releasing keeps the scrubbed rate.
    expect(video.playbackRate).toBeCloseTo(1.25);
    expect(slider).toHaveAttribute("aria-valuenow", "1.25");
  });

  it("snaps back to 1× when the drag is flung right and released", () => {
    const { video, slider } = mountSpeedControl();

    scrub(slider, [{ x: 100, y: 36 }]);
    expect(video.playbackRate).toBeCloseTo(1.4);

    // Way past the 72px arm threshold.
    scrub(slider, [{ x: 200, y: 100 }]);
    expect(video.playbackRate).toBe(1);
  });

  it("keeps the scrubbed rate when a rightward drag stops short of arming", () => {
    const { video, slider } = mountSpeedControl();

    // Drift right, but inside the arm threshold: still a scrub, not a reset.
    scrub(slider, [
      { x: 100, y: 84 },
      { x: 130, y: 84 }
    ]);
    expect(video.playbackRate).toBeCloseTo(1.1);
  });

  it("swallows the single click that follows a scrub release", () => {
    const { video, slider } = mountSpeedControl();

    scrub(slider, [{ x: 100, y: 60 }]);
    expect(video.playbackRate).toBeCloseTo(1.25);

    // The synthesized click after the release is eaten (fireEvent returns
    // false when preventDefault was called)…
    expect(fireEvent.click(document.body)).toBe(false);
    // …but only that one; the next click flows normally.
    expect(fireEvent.click(document.body)).toBe(true);
  });

  it("does not eat the click after a no-movement tap", () => {
    const { slider } = mountSpeedControl();

    scrub(slider, []);

    expect(fireEvent.click(document.body)).toBe(true);
  });

  it("ignores pointers that did not start the drag", () => {
    const { video, slider } = mountSpeedControl();

    act(() => {
      fireEvent.pointerDown(slider, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(slider, { pointerId: 1, clientX: 100, clientY: 60 });
      // A second pointer (stray touch) must not steer or end the drag.
      fireEvent.pointerMove(slider, { pointerId: 2, clientX: 100, clientY: 300 });
      fireEvent.pointerUp(slider, { pointerId: 2, clientX: 100, clientY: 300 });
    });
    expect(video.playbackRate).toBeCloseTo(1.25);

    act(() => {
      fireEvent.pointerUp(slider, { pointerId: 1, clientX: 100, clientY: 60 });
    });
    expect(video.playbackRate).toBeCloseTo(1.25);
  });

  it("scrubs from movement deltas while pointer-locked", () => {
    const { video, slider } = mountSpeedControl();

    // Pointer-lock stubs: lock engages on pointerdown and freezes clientX/Y,
    // so the control must integrate movementX/Y instead.
    let locked: Element | null = null;
    (slider as unknown as { requestPointerLock: () => Promise<void> }).requestPointerLock =
      () => {
        locked = slider;
        return Promise.resolve();
      };
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      get: () => locked
    });
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock =
      () => {
        locked = null;
      };

    try {
      act(() => {
        fireEvent.pointerDown(slider, { pointerId: 1, clientX: 100, clientY: 100 });
      });
      expect(locked).toBe(slider);

      act(() => {
        // Cursor frozen: clientY stays put, travel arrives as movementY.
        fireEvent.pointerMove(slider, {
          pointerId: 1,
          clientX: 100,
          clientY: 100,
          movementY: -40
        });
      });
      expect(video.playbackRate).toBeCloseTo(1.25);

      act(() => {
        fireEvent.pointerUp(slider, { pointerId: 1, clientX: 100, clientY: 100 });
      });
      expect(video.playbackRate).toBeCloseTo(1.25);
      // Release unpins the cursor.
      expect(locked).toBeNull();
    } finally {
      delete (document as unknown as { pointerLockElement?: unknown })
        .pointerLockElement;
    }
  });

  it("restores the pre-drag rate when the pointer is cancelled", () => {
    const { video, slider } = mountSpeedControl();

    scrub(slider, [{ x: 100, y: 20 }], { release: false });
    expect(video.playbackRate).toBeCloseTo(1.5);

    act(() => {
      fireEvent.pointerCancel(slider, { pointerId: 1 });
    });
    expect(video.playbackRate).toBe(1);
  });

  it("steps and resets the rate from the keyboard", () => {
    const { video, slider } = mountSpeedControl();

    // One act per press: each render must flush so the slider sees the new
    // rate before the next key.
    const press = (key: string) => {
      act(() => {
        fireEvent.keyDown(slider, { key });
      });
    };

    press("ArrowUp");
    press("ArrowUp");
    expect(video.playbackRate).toBeCloseTo(1.1);

    press("ArrowDown");
    expect(video.playbackRate).toBeCloseTo(1.05);

    press("PageDown");
    expect(video.playbackRate).toBeCloseTo(0.8);

    press("Home");
    expect(video.playbackRate).toBe(0.25);

    press("End");
    expect(video.playbackRate).toBe(3);

    press("Enter");
    expect(video.playbackRate).toBe(1);
  });

  it("tears down styles and resets playback rate when hidden", () => {
    const { player, video } = mountYouTubePlayer();

    act(() => {
      setPageUiVisible(player, true);
    });
    video.playbackRate = 0.5;
    expect(
      document.querySelector("style[data-you-loop-page-ui-style]")
    ).toBeInTheDocument();

    act(() => {
      setPageUiVisible(player, false);
    });

    expect(
      document.querySelector("[data-you-loop-page-ui]")
    ).not.toBeInTheDocument();
    expect(
      document.querySelector("style[data-you-loop-page-ui-style]")
    ).not.toBeInTheDocument();
    expect(video.playbackRate).toBe(1);
  });

  it("restores the timeline's inline styles when hidden", () => {
    const { player, progressBar } = mountYouTubePlayer();

    act(() => {
      setPageUiVisible(player, true);
    });
    expect(progressBar.style.zIndex).toBe("2147483647");

    act(() => {
      setPageUiVisible(player, false);
    });

    expect(progressBar.style.zIndex).toBe("");
    expect(progressBar.style.position).toBe("");
  });

  it("auto-enables the loop when launched from the popup", async () => {
    window.history.replaceState(null, "", "/watch?v=vid1");
    const storage = stubBrowserStorage({
      [SAVED_STORE_KEY]: {
        vid1: {
          loops: [{ id: "l1", name: "A", main: { start: 5, end: 9 }, zoom: null }],
          lastUsedId: "l1",
          lastSeen: 10,
          title: "Caprice 24"
        }
      },
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    const { player } = mountYouTubePlayer();

    await act(async () => {
      setPageUiVisible(player, true);
    });

    // Handles only render while the loop is enabled — the handoff flipped it on.
    expect(await screen.findByLabelText("Loop start")).toBeInTheDocument();
    // One-shot: consumed.
    expect(storage.dump()[LAUNCH_KEY]).toBeNull();
  });
});
