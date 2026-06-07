import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerOverlay } from "./PlayerOverlay";
import { createInitialPlaybackState } from "../playback/reducer";

describe("PlayerOverlay", () => {
  it("renders playback rate and play mode controls", () => {
    render(
      <PlayerOverlay
        duration={100}
        state={createInitialPlaybackState()}
        dispatch={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /loop mode/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /decrease speed/i })
    ).toBeInTheDocument();
    expect(screen.getByText("1x")).toBeInTheDocument();
  });

  it("dispatches playback rate commands", async () => {
    const dispatch = vi.fn();
    render(
      <PlayerOverlay
        duration={100}
        state={createInitialPlaybackState()}
        dispatch={dispatch}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /increase speed/i }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "setPlaybackRate",
      rate: 1.25
    });
  });

  it("opens zoom panel", async () => {
    render(
      <PlayerOverlay
        duration={100}
        state={createInitialPlaybackState()}
        dispatch={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /zoom/i }));

    expect(screen.getByTestId("zoom-panel")).toBeInTheDocument();
  });
});
