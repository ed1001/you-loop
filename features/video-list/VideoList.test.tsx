import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavedVideo } from "../persistence/loopStore";
import { VideoList } from "./VideoList";

const videos: SavedVideo[] = [
  { videoId: "vid1", title: "Caprice 24", count: 2, addedAt: 20 },
  { videoId: "vid2", title: undefined, count: 1, addedAt: 10 }
];

describe("VideoList", () => {
  it("shows the empty state when there are no videos", () => {
    render(<VideoList videos={[]} onOpenVideo={() => {}} />);
    expect(
      screen.getByText("No saved videos yet. Videos with saved loops appear here.")
    ).toBeInTheDocument();
  });

  it("renders title (or videoId fallback) and loop count, and opens on click", () => {
    const onOpen = vi.fn();
    render(<VideoList videos={videos} onOpenVideo={onOpen} />);

    expect(screen.getByText("Caprice 24")).toBeInTheDocument();
    expect(screen.getByText("vid2")).toBeInTheDocument();
    expect(screen.getByText("2 loops")).toBeInTheDocument();
    expect(screen.getByText("1 loop")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Caprice 24" }));
    expect(onOpen).toHaveBeenCalledWith("vid1");
  });

  it("marks the current video as playing and not clickable", () => {
    const onOpen = vi.fn();
    render(
      <VideoList videos={videos} currentVideoId="vid1" onOpenVideo={onOpen} />
    );

    const current = screen.getByRole("button", {
      name: "Caprice 24 (now playing)"
    });
    expect(current).toBeDisabled();
    expect(screen.getByText("Playing")).toBeInTheDocument();
  });

  it("hides delete buttons unless onDeleteVideo is provided", () => {
    render(<VideoList videos={videos} onOpenVideo={() => {}} />);
    expect(
      screen.queryByRole("button", { name: /Delete/ })
    ).not.toBeInTheDocument();
  });

  it("deletes in two stages: arm, then confirm", () => {
    const onDelete = vi.fn();
    render(
      <VideoList videos={videos} onOpenVideo={() => {}} onDeleteVideo={onDelete} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Caprice 24" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete Caprice 24" })
    );
    expect(onDelete).toHaveBeenCalledWith("vid1");
  });

  it("arming one row disarms the other — only one row armed at a time", () => {
    const onDelete = vi.fn();
    render(
      <VideoList videos={videos} onOpenVideo={() => {}} onDeleteVideo={onDelete} />
    );

    // Arm vid1
    fireEvent.click(screen.getByRole("button", { name: "Delete Caprice 24" }));
    expect(
      screen.getByRole("button", { name: "Confirm delete Caprice 24" })
    ).toBeInTheDocument();

    // Arm vid2 — vid1 should disarm
    fireEvent.click(screen.getByRole("button", { name: "Delete vid2" }));
    expect(
      screen.getByRole("button", { name: "Confirm delete vid2" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Caprice 24" })
    ).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("disarms a pending delete when the pointer leaves the row", () => {
    const onDelete = vi.fn();
    render(
      <VideoList videos={videos} onOpenVideo={() => {}} onDeleteVideo={onDelete} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Caprice 24" }));
    fireEvent.mouseLeave(
      screen.getByRole("button", { name: "Confirm delete Caprice 24" })
        .closest("li")!
    );
    expect(
      screen.getByRole("button", { name: "Delete Caprice 24" })
    ).toBeInTheDocument();
  });
});
