import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavedVideo } from "../persistence/loopStore";
import { VideoList, type FolderControls } from "./VideoList";

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

  it("renders title (or videoId fallback) without a loop count, and opens on click", () => {
    const onOpen = vi.fn();
    render(<VideoList videos={videos} onOpenVideo={onOpen} />);

    expect(screen.getByText("Caprice 24")).toBeInTheDocument();
    expect(screen.getByText("vid2")).toBeInTheDocument();
    expect(screen.queryByText(/\bloops?\b/)).not.toBeInTheDocument();

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

describe("VideoList folders", () => {
  const folders = [
    { id: "f1", name: "Paganini", createdAt: 1 },
    { id: "f2", name: "Jazz", createdAt: 2 }
  ];
  const filed: SavedVideo[] = [
    { videoId: "vid1", title: "Caprice 24", count: 2, addedAt: 20, folderId: "f1" },
    { videoId: "vid2", title: "Giant Steps", count: 1, addedAt: 10 }
  ];
  const controls = (over: Partial<FolderControls> = {}): FolderControls => ({
    folders,
    collapsed: [],
    onToggleGroup: vi.fn(),
    onMoveVideo: vi.fn(),
    onNewFolderFor: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    ...over
  });

  it("renders flat (no group headers, no move buttons) with no folders", () => {
    render(
      <VideoList
        videos={filed}
        onOpenVideo={() => {}}
        folderControls={controls({ folders: [] })}
      />
    );
    expect(screen.queryByRole("button", { name: /Unfiled/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();
  });

  it("groups videos under folder headers with Unfiled last", () => {
    render(<VideoList videos={filed} onOpenVideo={() => {}} folderControls={controls()} />);
    const headers = screen
      .getAllByRole("button", { expanded: true })
      .map((b) => b.getAttribute("aria-label"));
    expect(headers).toEqual(["Paganini, 1 video", "Jazz, 0 videos", "Unfiled, 1 video"]);
    expect(screen.getByText(/Empty — use a video/)).toBeInTheDocument();
  });

  it("collapsed groups hide their videos; header click toggles", () => {
    const onToggleGroup = vi.fn();
    render(
      <VideoList
        videos={filed}
        onOpenVideo={() => {}}
        folderControls={controls({ collapsed: ["f1"], onToggleGroup })}
      />
    );
    expect(screen.queryByText("Caprice 24")).not.toBeInTheDocument();
    expect(screen.getByText("Giant Steps")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paganini, 1 video" }));
    expect(onToggleGroup).toHaveBeenCalledWith("f1");
  });

  it("moves a video via its menu, and back to Unfiled", () => {
    const onMoveVideo = vi.fn();
    render(
      <VideoList videos={filed} onOpenVideo={() => {}} folderControls={controls({ onMoveVideo })} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Giant Steps to folder" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Jazz" }));
    expect(onMoveVideo).toHaveBeenCalledWith("vid2", "f2");

    fireEvent.click(screen.getByRole("button", { name: "Move Caprice 24 to folder" }));
    expect(screen.getByRole("menuitemradio", { name: "Paganini" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Unfiled" }));
    expect(onMoveVideo).toHaveBeenCalledWith("vid1", null);
  });

  it("offers New folder… from the move menu", () => {
    const onNewFolderFor = vi.fn();
    render(
      <VideoList videos={filed} onOpenVideo={() => {}} folderControls={controls({ onNewFolderFor })} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Giant Steps to folder" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New folder…" }));
    expect(onNewFolderFor).toHaveBeenCalledWith("vid2");
  });

  it("renames a folder inline", () => {
    const onRenameFolder = vi.fn();
    render(
      <VideoList videos={filed} onOpenVideo={() => {}} folderControls={controls({ onRenameFolder })} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Rename Jazz" }));
    const input = screen.getByRole("textbox", { name: "Folder name" });
    fireEvent.change(input, { target: { value: "Bebop" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRenameFolder).toHaveBeenCalledWith("f2", "Bebop");
  });

  it("deletes a folder only after two-stage confirm", () => {
    const onDeleteFolder = vi.fn();
    render(
      <VideoList videos={filed} onOpenVideo={() => {}} folderControls={controls({ onDeleteFolder })} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete folder Paganini" }));
    expect(onDeleteFolder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete folder Paganini" }));
    expect(onDeleteFolder).toHaveBeenCalledWith("f1");
  });
});
