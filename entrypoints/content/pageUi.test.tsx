import { act } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setPageUiVisible } from "./pageUi";

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

describe("page UI", () => {
  afterEach(() => {
    document.body.innerHTML = "";
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
});
