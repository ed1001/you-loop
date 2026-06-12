import { act } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setPageUiVisible } from "./pageUi";
import { SAVED_STORE_KEY } from "../../features/persistence/loopStore";
import { LAUNCH_KEY } from "../../features/persistence/settingsStore";

function enableLoop() {
  fireEvent.click(screen.getByLabelText("Enable loop range"));
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

  it("changes the video playback rate from the speed stepper", () => {
    const { player, video } = mountYouTubePlayer();

    act(() => {
      setPageUiVisible(player, true);
    });
    act(() => {
      enableLoop();
    });

    act(() => {
      fireEvent.click(screen.getByLabelText("Increase speed"));
      fireEvent.click(screen.getByLabelText("Increase speed"));
    });
    expect(video.playbackRate).toBeCloseTo(1.5);

    act(() => {
      fireEvent.click(screen.getByLabelText(/click to reset/));
    });
    expect(video.playbackRate).toBeCloseTo(1);
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
