import { act } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPageUiVisible, nextCompactState, watchPlayerWidth } from "./pageUi";
import { keyFor } from "../../features/persistence/loopStore";
import { LAUNCH_KEY, LOOP_ON_KEY } from "../../features/persistence/settingsStore";
import { COUNT_IN_KEY, countInKeyFor } from "../../features/persistence/countInStore";
import { makeMemoryArea } from "../../features/persistence/memoryArea.testutil";

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

// jsdom has no scrollIntoView; SavedLoopsModal calls it on the selected row
// whenever the modal opens with a clean (non-dirty) selection — a path only
// exercised once these tempo-dirty tests open the modal on an applied,
// unmodified loop.
if (typeof window.HTMLElement.prototype.scrollIntoView !== "function") {
  window.HTMLElement.prototype.scrollIntoView = function () {};
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

// Mount a player, reveal the UI, and turn the loop on — the shared setup for
// the wrap/latch tests below.
function mountWithLoopEnabled() {
  const ctx = mountYouTubePlayer();
  act(() => {
    setPageUiVisible(ctx.player, true);
  });
  act(() => {
    enableLoop();
  });
  return ctx;
}

// In-memory browser.storage stub covering both sync and local, with get(null)
// support required by listEntries/loadEntry.
function stubBrowserStorage(initial: Record<string, unknown> = {}) {
  const area = makeMemoryArea(initial);
  vi.stubGlobal("browser", {
    storage: { sync: area, local: area },
    runtime: { getURL: (p: string) => p }
  });
  return { dump: area.dump };
}

// A video entry with one saved loop, the fixture every saved-loop test reuses.
const SAVED_ENTRY = {
  loops: [{ id: "l1", name: "A", main: { start: 5, end: 9 }, zoom: null }],
  lastUsedId: "l1",
  addedAt: 10,
  title: "Caprice 24"
} as const;

// Flush the async load chain (loadEntry → takeLaunch → getLoopOn).
async function flushAsync() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

// Mount on a watch page with the given storage and reveal the UI.
async function mountWatch(
  videoId: string,
  initial: Record<string, unknown> = {}
) {
  window.history.replaceState(null, "", `/watch?v=${videoId}`);
  const storage = stubBrowserStorage(initial);
  const ctx = mountYouTubePlayer();
  await act(async () => {
    setPageUiVisible(ctx.player, true);
  });
  return { ...ctx, ...storage };
}

// Fire SPA navigation to a new video and flush the async reload.
async function navigateTo(videoId: string) {
  window.history.replaceState(null, "", `/watch?v=${videoId}`);
  await act(async () => {
    document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function expectPanelOn() {
  expect(screen.getByLabelText("Disable loop range")).toBeInTheDocument();
}

function expectPanelOff() {
  expect(screen.getByLabelText("Enable loop range")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Disable loop range")
  ).not.toBeInTheDocument();
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

  // Cold-load race: YouTube can paint `.html5-video-player` (and even the
  // <video>) before the progress bar exists. The mount must not give up — it
  // arms an observer and attaches as soon as the timeline appears, instead of
  // leaving the panel missing until a manual refresh.
  it("mounts once the progress bar appears late (cold-load race)", async () => {
    const player = document.createElement("div");
    player.className = "html5-video-player";
    const video = document.createElement("video");
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    player.append(video); // no `.ytp-progress-bar` yet
    document.body.append(player);

    act(() => {
      setPageUiVisible(player, true);
    });
    expect(document.querySelector("[data-you-loop-page-ui]")).toBeNull();

    const progressBar = document.createElement("div");
    progressBar.className = "ytp-progress-bar";
    await act(async () => {
      player.append(progressBar);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(document.querySelector("[data-you-loop-page-ui]")).not.toBeNull();
  });

  it("does not mount a panel after the late progress bar if disabled first", async () => {
    const player = document.createElement("div");
    player.className = "html5-video-player";
    const video = document.createElement("video");
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    player.append(video);
    document.body.append(player);

    act(() => {
      setPageUiVisible(player, true);
    });
    act(() => {
      setPageUiVisible(player, false);
    });

    const progressBar = document.createElement("div");
    progressBar.className = "ytp-progress-bar";
    await act(async () => {
      player.append(progressBar);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(document.querySelector("[data-you-loop-page-ui]")).toBeNull();
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

  it("wraps the playhead to the segment start when it crosses the end", () => {
    const { video } = mountWithLoopEnabled();

    // Default loop on a 120s video spans the whole timeline: 0–120.
    video.currentTime = 120;
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(0);
  });

  it("does not stack a second seek while one is already in flight", () => {
    const { video } = mountWithLoopEnabled();

    // A seek to the segment start is mid-flight: `seeking` is true and
    // `currentTime` still reads the pre-seek (past-end) value. Acting on it
    // would fire a redundant seek and make YouTube re-buffer.
    Object.defineProperty(video, "seeking", {
      configurable: true,
      get: () => true
    });
    video.currentTime = 97;
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(97);
  });

  it("latches after a wrap so a stalled seek does not re-fire every tick", () => {
    const { video } = mountWithLoopEnabled();

    // First wrap: the playhead crosses the end, so it seeks to the start.
    video.currentTime = 120;
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(0);

    // The seek hasn't landed yet (unbuffered start): the playhead still reads
    // past the end and `seeked` has not fired. The latch must suppress another
    // seek — otherwise it re-fires every frame and spirals into a freeze.
    video.currentTime = 120;
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(120);

    // Once the seek lands (`seeked`), looping resumes normally.
    act(() => {
      fireEvent(video, new Event("seeked"));
    });
    video.currentTime = 120;
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(0);
  });

  it("auto-enables the loop when launched from the popup", async () => {
    const { dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: SAVED_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });

    // Handles only render while the loop is enabled — the handoff flipped it on.
    expect(await screen.findByLabelText("Loop start")).toBeInTheDocument();
    // One-shot: consumed.
    expect(dump()[LAUNCH_KEY]).toBeNull();
  });

  it("does not auto-enable on a saved video when the panel was off", async () => {
    await mountWatch("vid1", { [keyFor("vid1")]: SAVED_ENTRY });
    await flushAsync();

    // Saved loops exist, but the panel was never on — it stays off.
    expectPanelOff();
  });

  it("keeps the panel active across navigation to a video with loops", async () => {
    await mountWatch("vid1", { [keyFor("vid2")]: SAVED_ENTRY });
    // Turn the panel on manually on vid1 (which has no saved loops).
    act(() => {
      enableLoop();
    });
    expectPanelOn();

    // Navigate to vid2 (has loops): the active state carries over.
    await navigateTo("vid2");
    expectPanelOn();
  });

  it("leaves the panel off across navigation when it was off", async () => {
    await mountWatch("vid1", { [keyFor("vid2")]: SAVED_ENTRY });

    // Navigate to vid2 (has loops) without ever turning the panel on.
    await navigateTo("vid2");
    expectPanelOff();
  });

  it("restores the panel on from the persisted preference", async () => {
    await mountWatch("fresh", { [LOOP_ON_KEY]: true });

    // Persisted on, no launch, no saved loops — the preference alone turns it on.
    expect(await screen.findByLabelText("Disable loop range")).toBeInTheDocument();
  });

  it("persists the on/off state when toggled", async () => {
    const { dump } = await mountWatch("vid1");

    act(() => {
      enableLoop();
    });
    await flushAsync();
    expect(dump()[LOOP_ON_KEY]).toBe(true);

    act(() => {
      fireEvent.click(screen.getByLabelText("Disable loop range"));
    });
    await flushAsync();
    expect(dump()[LOOP_ON_KEY]).toBe(false);
  });

  it("keeps the panel on across navigation regardless of saved loops", async () => {
    await mountWatch("vid1");
    act(() => {
      enableLoop();
    });
    expectPanelOn();

    // Navigate to a video with nothing saved: the persisted on state carries.
    await navigateTo("bare");
    expectPanelOn();
  });

  it("does not auto-apply a saved loop on navigation", async () => {
    const { video } = await mountWatch("vid1", { [keyFor("vid2")]: SAVED_ENTRY });
    act(() => {
      enableLoop();
    });

    // Navigate to vid2 (has a 5–9 loop). It stays on, but the region is the
    // default whole timeline — the saved loop is NOT auto-applied.
    await navigateTo("vid2");
    expectPanelOn();

    // Playhead at 50s: if the 5–9 loop had loaded, enforce would snap to 5.
    // With the default 0–120 loop it stays put.
    video.currentTime = 50;
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(50);
  });

  it("does not apply the previous video's loop to the playhead on navigation", async () => {
    const { video } = await mountWatch("vid1");
    // Active on vid1 with the default whole-timeline loop.
    act(() => {
      enableLoop();
    });

    // SPA-navigate. Until loadForVideo() resolves (async), an enforce tick must
    // NOT snap the playhead — the previous segment is cleared on navigate.
    window.history.replaceState(null, "", "/watch?v=vid2");
    video.currentTime = 50;
    act(() => {
      document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
    });
    act(() => {
      fireEvent.timeUpdate(video);
    });

    expect(video.currentTime).toBe(50);
  });

  it("swallows the drag-end click even when release comes macrotasks after grab", async () => {
    const { player } = mountWithLoopEnabled();

    const timeline = player.querySelector(
      "[data-testid='timeline-handles']"
    ) as HTMLElement;
    timeline.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const startHandle = screen.getByLabelText("Loop start");
    startHandle.setPointerCapture = () => {};

    // A stand-in for YouTube's play/pause click handler on the player.
    const playerClick = vi.fn();
    document.addEventListener("click", playerClick);

    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 0 });
    });
    // Real drags hold the pointer across many macrotasks before releasing; a
    // grab-time click guard with a 0ms lifetime dies right here.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 20 });
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 20 });
      // The click the browser synthesizes after the drag, landing on the video.
      fireEvent.click(document.body);
    });
    expect(playerClick).not.toHaveBeenCalled();

    // The guard is one-shot: an unrelated later click still gets through.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      fireEvent.click(document.body);
    });
    expect(playerClick).toHaveBeenCalledTimes(1);
    document.removeEventListener("click", playerClick);
  });

  it("shows a time chip on the dragged handle and hides it on release", () => {
    const { player } = mountWithLoopEnabled();

    const timeline = player.querySelector(
      "[data-testid='timeline-handles']"
    ) as HTMLElement;
    timeline.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const startHandle = screen.getByLabelText("Loop start");
    startHandle.setPointerCapture = () => {};

    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 0 });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 20 });
    });
    // Mid-drag: the chip is live and tracks the handle's time.
    expect(startHandle.dataset.dragLive).toBe("true");
    expect(
      startHandle.querySelector(".you-loop-handle-chip")?.textContent
    ).toBe("0:20");

    act(() => {
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 20 });
    });
    expect(startHandle.dataset.dragLive).toBeUndefined();
  });

  it("keeps the user's loop when the same video re-fires durationchange (ads, live)", async () => {
    const { player, video } = await mountWatch("vid1");
    await flushAsync();
    act(() => {
      enableLoop();
    });

    const timeline = player.querySelector(
      "[data-testid='timeline-handles']"
    ) as HTMLElement;
    // 1px == 1s so pointer clientX maps directly to seconds (duration is 120).
    timeline.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const startHandle = screen.getByLabelText("Loop start");
    startHandle.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 0 });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 20 });
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 20 });
    });

    const band = player.querySelector(".you-loop-loop-range") as HTMLElement;
    expect(band.style.left).toBe("16.666666666666664%"); // 20/120

    // A mid-roll ad or a live stream re-fires durationchange on the same
    // video element. That must not reseed the loop back to the default.
    await act(async () => {
      fireEvent(video, new Event("durationchange"));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(band.style.left).toBe("16.666666666666664%");
  });

  it("suspends loop enforcement while an ad is showing", () => {
    const { player, video } = mountWithLoopEnabled();

    // Default 0–120 loop. An ad takes over the same <video>: the playhead
    // crossing the segment end must NOT wrap — that would loop the ad.
    player.classList.add("ad-showing");
    video.currentTime = 120;
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(120);

    // Ad over: enforcement resumes.
    player.classList.remove("ad-showing");
    act(() => {
      fireEvent.timeUpdate(video);
    });
    expect(video.currentTime).toBe(0);
  });

  it("survives a popup launch pointing at an entry with no loops", async () => {
    await mountWatch("vid1", {
      [keyFor("vid1")]: { loops: [], lastUsedId: null, addedAt: 10, title: "Empty" },
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    // Must not crash the overlay: with no loop to apply, the launch falls back
    // to the persisted preference (off here) and the pill still renders.
    expectPanelOff();
  });

  it("applying a loop with a count-in snapshot restores and persists it", async () => {
    const entry = {
      ...SAVED_ENTRY,
      loops: [
        {
          ...SAVED_ENTRY.loops[0],
          countIn: { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 }
        }
      ]
    };
    const { dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: entry,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    // Launch applied the loop: the per-video store now carries the snapshot.
    expect((dump()[countInKeyFor("vid1")] as any)?.bpm).toBe(140);
  });

  it("rows show a tempo badge and a loop-map band", async () => {
    const entry = {
      ...SAVED_ENTRY,
      loops: [
        {
          ...SAVED_ENTRY.loops[0],
          countIn: { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 }
        }
      ]
    };
    await mountWatch("vid1", { [keyFor("vid1")]: entry });
    await flushAsync();
    act(() => {
      enableLoop();
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });
    const band = document.querySelector(".you-loop-lm-map-band") as HTMLElement;
    // SAVED_ENTRY loop 5–9 on a 120s video.
    expect(band.style.left).toBe("4.166666666666666%");
    expect(band.style.width).toBe("3.3333333333333335%");
  });

  // Spec §2 headline behavior: changing count-in settings while a
  // snapshot-carrying saved loop is selected must flip the selection dirty
  // (row deselects). Drives the change through the count-in popover's
  // time-signature buttons — the simplest public seam for
  // onCountInSettingsChange — rather than the BPM drag/tap gestures, which
  // are covered in CountInControl.test.tsx.
  it("changing count-in settings dirties a tempo-snapshot selection", async () => {
    const entry = {
      ...SAVED_ENTRY,
      loops: [
        {
          ...SAVED_ENTRY.loops[0],
          countIn: { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 }
        }
      ]
    };
    await mountWatch("vid1", {
      [keyFor("vid1")]: entry,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });

    // Launch auto-applied the loop: the row reads selected, clean.
    expect(
      document.querySelector('.you-loop-lm-row[data-selected="true"]')
    ).not.toBeNull();

    // The pill button only opens the popover; on/off lives on the switch
    // inside it, so this click cannot itself dirty anything.
    act(() => {
      fireEvent.click(screen.getByLabelText("Count-in off"));
    });
    act(() => {
      fireEvent.click(screen.getByText("3/4"));
    });

    // Tempo-dirty: the row deselects.
    expect(
      document.querySelector('.you-loop-lm-row[data-selected="true"]')
    ).toBeNull();
  });

  // Negative counterpart: a legacy loop (no count-in snapshot) has nothing to
  // diff tempo against, so the same settings change must NOT go dirty.
  it("changing count-in settings leaves a legacy selection clean", async () => {
    await mountWatch("vid1", {
      [keyFor("vid1")]: SAVED_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });
    expect(
      document.querySelector('.you-loop-lm-row[data-selected="true"]')
    ).not.toBeNull();

    act(() => {
      fireEvent.click(screen.getByLabelText("Count-in off"));
    });
    act(() => {
      fireEvent.click(screen.getByText("3/4"));
    });

    expect(
      document.querySelector('.you-loop-lm-row[data-selected="true"]')
    ).not.toBeNull();
  });

  it("applying a legacy loop leaves count-in settings untouched", async () => {
    const { dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: SAVED_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    expect(dump()[countInKeyFor("vid1")]).toBeUndefined();
  });

  it("saving a loop snapshots the current count-in settings", async () => {
    const { dump } = await mountWatch("vid1", {
      [countInKeyFor("vid1")]: { bpm: 90, beatsPerBar: 3, noteValue: 4, bars: 2 }
    });
    await flushAsync();

    act(() => {
      enableLoop();
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });
    fireEvent.change(screen.getByPlaceholderText("Name this loop"), {
      target: { value: "riff" }
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const savedEntry = dump()[keyFor("vid1")] as any;
    expect(savedEntry.loops[0].countIn).toEqual({
      bpm: 90,
      beatsPerBar: 3,
      noteValue: 4,
      bars: 2
    });
  });

  it("] nudges the main loop window forward by NUDGE_SECONDS and seeks to the new start", () => {
    const { player, video } = mountWithLoopEnabled();

    const timeline = player.querySelector(
      "[data-testid='timeline-handles']"
    ) as HTMLElement;
    // 1px == 1s so pointer clientX maps directly to seconds (duration is 120).
    timeline.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;

    const startHandle = screen.getByLabelText("Loop start");
    const endHandle = screen.getByLabelText("Loop end");

    // jsdom does not implement setPointerCapture; stub it on both handles so the
    // TimelineHandles onPointerDown handler does not throw.
    startHandle.setPointerCapture = () => {};
    endHandle.setPointerCapture = () => {};

    // Drag handles to make a 20–40 loop.
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 0 });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 20 });
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 20 });
    });
    act(() => {
      fireEvent.pointerDown(endHandle, { pointerId: 2, clientX: 120 });
      fireEvent.pointerMove(endHandle, { pointerId: 2, clientX: 40 });
      fireEvent.pointerUp(endHandle, { pointerId: 2, clientX: 40 });
    });

    const band = player.querySelector(".you-loop-loop-range") as HTMLElement;
    expect(band.style.left).toBe("16.666666666666664%"); // 20/120
    expect(band.style.width).toBe("16.666666666666664%"); // (40-20)/120

    // Press ] — nudges forward by NUDGE_SECONDS (1s): 20–40 → 21–41.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "BracketRight", bubbles: true })
      );
    });

    expect(band.style.left).toBe("17.5%"); // 21/120
    expect(band.style.width).toBe("16.666666666666664%"); // 20/120 — length unchanged
    // Playhead seeks to the new window start.
    expect(video.currentTime).toBe(21);

    // Press Shift+] — steps forward by full length (20s): 21–41 → 41–61.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "BracketRight", shiftKey: true, bubbles: true })
      );
    });

    expect(band.style.left).toBe("34.166666666666664%"); // 41/120
    expect(band.style.width).toBe("16.666666666666664%"); // 20/120 — length unchanged
    // Playhead seeks to the new window start.
    expect(video.currentTime).toBe(41);
  });

  // Regression test for Fix 1: the controller's own wrap seek must NOT cancel
  // the count-in it just started.
  //
  // Root cause: enforce() sets video.currentTime = start (the wrap seek) and
  // then calls countInController.onWrap() (sets counting=true, pauses video).
  // Setting currentTime fires a `seeking` event as a queued task. Without the
  // !wrapSeekPending guard the `seeking` listener sees isCounting()===true and
  // immediately cancels the count on every single wrap.
  //
  // The fix sets wrapSeekPending=true synchronously in enforce() (on
  // result.sought) before the queued `seeking` fires, so the listener skips
  // the cancel for the controller's own wrap seek. A genuine user scrub (which
  // does NOT set wrapSeekPending) still cancels correctly.
  //
  // We cannot drive a full AudioContext in jsdom, so we stub window.AudioContext
  // with a minimal mock that returns state:"running" — just enough for
  // countInPlayer.play() to return true (which is required for counting=true).
  // Stub AudioContext so countInPlayer.play() can return true.
  // The mock satisfies: ctx.state === "running", ctx.currentTime,
  // ctx.createOscillator(), ctx.createGain(), ctx.destination, ctx.resume().
  const stubRunningAudioContext = () => {
    const mockGain = {
      connect: () => {},
      gain: {
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {}
      }
    };
    const mockOsc = {
      type: "",
      frequency: { value: 0 },
      connect: () => {},
      start: () => {},
      stop: () => {}
    };
    class MockAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() { return mockOsc; }
      createGain() { return mockGain; }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
  };

  // Mount the page UI with the loop on and count-in enabled via storage.
  const mountWithCountInOn = async (videoId: string) => {
    stubRunningAudioContext();
    window.history.replaceState(null, "", `/watch?v=${videoId}`);
    const area = makeMemoryArea({ [COUNT_IN_KEY]: true, [LOOP_ON_KEY]: true });
    vi.stubGlobal("browser", {
      storage: { sync: area, local: area },
      runtime: { getURL: (p: string) => p }
    });
    const { video } = mountYouTubePlayer();
    await act(async () => {
      setPageUiVisible(video.closest(".html5-video-player")!, true);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    // Sanity: loop is on (persisted LOOP_ON_KEY=true loaded from storage).
    expect(screen.getByLabelText("Disable loop range")).toBeInTheDocument();
    return { video };
  };

  it("wrap seek does not cancel the count-in it triggered", async () => {
    const { video } = await mountWithCountInOn("wrap-seek-test");

    // Spy on video.play so we can detect whether cancel() resumed playback.
    // cancel() calls video.play() when the video is paused; if the wrap's own
    // seeking event incorrectly triggers cancel(), play() is called here.
    const playSpy = vi.spyOn(video, "play").mockResolvedValue(undefined);

    // Trigger a wrap: advance past the loop end (default 0–120) and fire
    // timeupdate. enforce() will:
    //   1. set video.currentTime = 0 (wrap seek) → sets wrapSeekPending=true
    //   2. call countInController.onWrap() → sets counting=true, pauses video
    video.currentTime = 120;
    act(() => {
      fireEvent.timeUpdate(video);
    });

    // Now dispatch the `seeking` event that the browser queues asynchronously
    // after setting currentTime in enforce(). Before Fix 1, this would see
    // isCounting()===true and cancel the count — calling video.play() to
    // resume playback. After the fix, wrapSeekPending===true so the cancel
    // is skipped and play() is NOT called here.
    act(() => {
      fireEvent(video, new Event("seeking"));
    });

    // play() must NOT have been called: the wrap's own seeking event must not
    // have cancelled the count-in. Before the fix this would have been called
    // once (cancel → play to resume).
    expect(playSpy).not.toHaveBeenCalled();
  });

  // The video must never play while a count runs: a play attempt mid-count
  // (Space/K, the player button) is a pause intent — it stops the count and
  // the video stays paused.
  it("a play attempt during the count pauses and stops the count", async () => {
    const { video } = await mountWithCountInOn("play-guard-test");

    // Trigger a wrap so a count begins (counting=true, video paused).
    video.currentTime = 120;
    act(() => {
      fireEvent.timeUpdate(video);
    });

    // The user hits Space: YouTube starts playback → `play` fires. The guard
    // must re-pause immediately (pause intent while counting).
    const pauseSpy = vi.spyOn(video, "pause");
    act(() => {
      fireEvent(video, new Event("play"));
    });
    expect(pauseSpy).toHaveBeenCalled();

    // The count was cancelled: a second play attempt is a normal play and
    // must NOT be re-paused.
    pauseSpy.mockClear();
    act(() => {
      fireEvent(video, new Event("play"));
    });
    expect(pauseSpy).not.toHaveBeenCalled();
  });
});

describe("nextCompactState", () => {
  it("becomes compact when clearly narrow", () => {
    expect(nextCompactState(734, false)).toBe(true);
  });

  it("stays full at the enter boundary", () => {
    expect(nextCompactState(735, false)).toBe(false);
  });

  it("stays full when clearly wide", () => {
    expect(nextCompactState(900, false)).toBe(false);
  });

  it("holds compact across the dead band", () => {
    expect(nextCompactState(740, true)).toBe(true);
    expect(nextCompactState(754, true)).toBe(true);
  });

  it("exits compact only at or past the exit boundary", () => {
    expect(nextCompactState(755, true)).toBe(false);
    expect(nextCompactState(775, true)).toBe(false);
  });

  it("holds full across the dead band coming from wide", () => {
    expect(nextCompactState(740, false)).toBe(false);
  });
});

describe("compact mode toggle", () => {
  it("renders a mode toggle button reflecting the current mode", () => {
    const mounted = mountYouTubePlayer();
    act(() => {
      setPageUiVisible(mounted.player, true);
    });
    act(() => {
      enableLoop();
    });

    const toggle = screen.getByLabelText(/switch to one-shot/i);
    expect(toggle.dataset.mode).toBe("loop");

    act(() => {
      fireEvent.click(toggle);
    });

    expect(screen.getByLabelText(/switch to loop/i).dataset.mode).toBe(
      "one-shot"
    );
  });
});

describe("watchPlayerWidth", () => {
  it("sets data-compact on the panel from the observed width", () => {
    const callbacks: ResizeObserverCallback[] = [];
    const original = window.ResizeObserver;
    class StubRO {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    window.ResizeObserver = StubRO;

    const panel = document.createElement("div");
    Object.defineProperty(panel, "clientWidth", {
      configurable: true,
      value: 300
    });

    const stop = watchPlayerWidth(panel);
    // initial sync runs in the helper
    expect(panel.dataset.compact).toBe("true");

    Object.defineProperty(panel, "clientWidth", {
      configurable: true,
      value: 900
    });
    callbacks[0]([], {} as ResizeObserver);
    expect(panel.dataset.compact).toBe("false");

    stop();
    window.ResizeObserver = original;
  });
});

describe("pencil edit", () => {
  // A preceding describe block ("compact mode toggle") mounts a player
  // without tearing it down, so the DOM can arrive dirty here regardless of
  // this block's own afterEach. Start clean rather than depend on run order.
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    fireEvent.click(document.body);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  // A wide main region (unlike SAVED_ENTRY's narrow 5–9) so dragging the
  // start handle out to 20s lands cleanly inside it instead of clamping
  // against the end.
  const UPDATE_ENTRY = {
    loops: [
      {
        id: "l1",
        name: "A",
        main: { start: 5, end: 100 },
        zoom: null,
        countIn: { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 }
      }
    ],
    lastUsedId: "l1",
    addedAt: 10,
    title: "Caprice 24"
  };

  // Applies the launch-restored loop, then drags "Loop start" from 5s to 20s
  // (1px == 1s: rect width matches the 120s stub duration) so the selection
  // drifts off the saved loop.
  function driftMainStart(player: HTMLElement) {
    const timeline = player.querySelector(
      "[data-testid='timeline-handles']"
    ) as HTMLElement;
    timeline.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 10, right: 120, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const startHandle = screen.getByLabelText("Loop start");
    startHandle.setPointerCapture = () => {};
    act(() => {
      fireEvent.pointerDown(startHandle, { pointerId: 1, clientX: 0 });
      fireEvent.pointerMove(startHandle, { pointerId: 1, clientX: 20 });
      fireEvent.pointerUp(startHandle, { pointerId: 1, clientX: 20 });
    });
  }

  // A second loop on the same video, for the "edit a row other than the
  // applied source" cases below.
  const TWO_LOOP_ENTRY = {
    loops: [
      {
        id: "l1",
        name: "A",
        main: { start: 5, end: 100 },
        zoom: null,
        countIn: { bpm: 140, beatsPerBar: 4, noteValue: 4, bars: 1 }
      },
      {
        id: "l2",
        name: "B",
        main: { start: 10, end: 50 },
        zoom: null,
        countIn: null
      }
    ],
    lastUsedId: "l1",
    addedAt: 10,
    title: "Caprice 24"
  };

  it("pencil opens the edit row seeded with the name; Replace persists the new main and selects it", async () => {
    const { player, dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: UPDATE_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    driftMainStart(player);
    // The drag-end click guard (suppressNextClick) eats the very next click
    // regardless of target; let its one-shot timeout clear before opening
    // the modal so that click isn't swallowed too.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });

    act(() => {
      fireEvent.click(screen.getByLabelText("Edit A"));
    });
    expect(screen.getByLabelText("Loop name")).toHaveValue("A");

    // Replace is a draft toggle: arming it must not touch storage yet.
    act(() => {
      fireEvent.click(screen.getByLabelText("Replace A with current loop"));
    });
    expect(
      screen.getByLabelText("Replace A with current loop")
    ).toHaveAttribute("aria-pressed", "true");
    expect((dump()[keyFor("vid1")] as any).loops[0].main).toEqual({
      start: 5,
      end: 100
    });
    expect(screen.getByLabelText("Cancel edit")).toBeInTheDocument();

    // Save commits the armed replacement.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save changes to A"));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const savedEntry = dump()[keyFor("vid1")] as any;
    expect(savedEntry.loops[0].main).toEqual({ start: 20, end: 100 });

    // Edit row closes, and the row re-selects now that it matches current state.
    expect(screen.queryByLabelText("Cancel edit")).not.toBeInTheDocument();
    expect(
      document.querySelector('.you-loop-lm-row[data-selected="true"]')
    ).not.toBeNull();
  });

  it("Replace on a loop other than the applied source updates only it, moving selection to it", async () => {
    const { dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: TWO_LOOP_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });

    // A is the applied source (current selection is A's 5–100); replace B
    // instead of A.
    act(() => {
      fireEvent.click(screen.getByLabelText("Edit B"));
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Replace B with current loop"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save changes to B"));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const savedEntry = dump()[keyFor("vid1")] as any;
    expect(savedEntry.loops[0].main).toEqual({ start: 5, end: 100 }); // A untouched
    expect(savedEntry.loops[1].main).toEqual({ start: 5, end: 100 }); // B now matches current selection

    expect(
      screen.getByLabelText("Apply B").closest("li")?.dataset.selected
    ).toBe("true");
    expect(
      screen.getByLabelText("Apply A").closest("li")?.dataset.selected
    ).toBe("false");
  });

  it("renaming a loop leaves its region untouched and does not move selection", async () => {
    const { dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: TWO_LOOP_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });
    // Launch applied A: it holds the selection.
    expect(
      screen.getByLabelText("Apply A").closest("li")?.dataset.selected
    ).toBe("true");

    act(() => {
      fireEvent.click(screen.getByLabelText("Edit B"));
    });
    fireEvent.change(screen.getByLabelText("Loop name"), {
      target: { value: "Bridge" }
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save changes to B"));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const savedEntry = dump()[keyFor("vid1")] as any;
    expect(savedEntry.loops[1].name).toBe("Bridge");
    expect(savedEntry.loops[1].main).toEqual({ start: 10, end: 50 }); // untouched

    // Rename must not steal the selection from A.
    expect(
      screen.getByLabelText("Apply A").closest("li")?.dataset.selected
    ).toBe("true");
    expect(
      screen.getByLabelText("Apply Bridge").closest("li")?.dataset.selected
    ).toBe("false");
  });

  it("renaming and replacing together update both name and main", async () => {
    const { dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: UPDATE_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Edit A"));
    });
    fireEvent.change(screen.getByLabelText("Loop name"), {
      target: { value: "Coda" }
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Replace A with current loop"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save changes to A"));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const savedEntry = dump()[keyFor("vid1")] as any;
    expect(savedEntry.loops[0].name).toBe("Coda");
    expect(savedEntry.loops[0].main).toEqual({ start: 5, end: 100 });
  });

  it("✕ cancels the edit without touching storage; Escape backs out one level at a time", async () => {
    const { dump } = await mountWatch("vid1", { [keyFor("vid1")]: SAVED_ENTRY });
    await flushAsync();
    act(() => {
      enableLoop();
    });
    // Once the modal is open the dialog itself shares the "Saved loops"
    // accessible name, so scope the toggle lookup to its role.
    const toggle = screen.getByRole("button", { name: "Saved loops" });
    act(() => {
      fireEvent.click(toggle);
    });

    act(() => {
      fireEvent.click(screen.getByLabelText("Edit A"));
    });
    fireEvent.change(screen.getByLabelText("Loop name"), {
      target: { value: "changed" }
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Cancel edit"));
    });

    expect(screen.queryByLabelText("Cancel edit")).not.toBeInTheDocument();
    expect(dump()[keyFor("vid1")]).toEqual(SAVED_ENTRY);

    // Escape: first cancels a re-opened edit, modal stays open.
    act(() => {
      fireEvent.click(screen.getByLabelText("Edit A"));
    });
    expect(screen.getByLabelText("Cancel edit")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(screen.queryByLabelText("Cancel edit")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    // Second Escape: nothing being edited, so it closes the modal.
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("has no subtitle summarizing the current selection", async () => {
    await mountWatch("vid1", { [keyFor("vid1")]: SAVED_ENTRY });
    await flushAsync();
    act(() => {
      enableLoop();
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });
    expect(screen.queryByText(/Current selection/)).not.toBeInTheDocument();
  });

  it("save section stays enabled for a clean selection and can save a duplicate", async () => {
    const { dump } = await mountWatch("vid1", {
      [keyFor("vid1")]: SAVED_ENTRY,
      [LAUNCH_KEY]: { videoId: "vid1", ts: Date.now() }
    });
    await flushAsync();

    act(() => {
      fireEvent.click(screen.getByLabelText("Saved loops"));
    });

    const input = screen.getByPlaceholderText("Name this loop");
    expect(input).not.toBeDisabled();

    fireEvent.change(input, { target: { value: "dup" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const savedEntry = dump()[keyFor("vid1")] as any;
    expect(savedEntry.loops).toHaveLength(2);
    expect(savedEntry.loops[1].name).toBe("dup");
    expect(savedEntry.loops[1].main).toEqual(savedEntry.loops[0].main);
  });
});
