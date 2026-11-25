import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { keyFor } from "../../features/persistence/loopStore";
import { ENABLED_KEY, LAUNCH_KEY } from "../../features/persistence/settingsStore";
import { COLLAPSED_GROUPS_KEY, FOLDERS_KEY } from "../../features/persistence/folderStore";
import { makeMemoryArea as makeArea } from "../../features/persistence/memoryArea.testutil";
import { App } from "./App";

const seededStore = {
  [keyFor("vid1")]: {
    loops: [{ id: "l1", name: "A", main: { start: 1, end: 2 }, zoom: null }],
    lastUsedId: "l1",
    addedAt: 10,
    title: "Caprice 24"
  },
  [keyFor("vid2")]: {
    loops: [
      { id: "l2", name: "B", main: { start: 3, end: 4 }, zoom: null },
      { id: "l3", name: "C", main: { start: 5, end: 6 }, zoom: null }
    ],
    lastUsedId: "l2",
    addedAt: 20,
    title: "Giant Steps"
  }
};

// vid1 ("Caprice 24") filed in folder "Paganini"; vid2 unfiled.
const paganiniStore = {
  ...seededStore,
  [keyFor("vid1")]: { ...seededStore[keyFor("vid1")], folderId: "f1" },
  [FOLDERS_KEY]: [{ id: "f1", name: "Paganini", createdAt: 1 }]
};

describe("popup App", () => {
  it("renders saved videos most-recent first", async () => {
    render(<App area={makeArea(seededStore)} />);

    const names = await screen.findAllByText(/Caprice 24|Giant Steps/);
    expect(names.map((n) => n.textContent)).toEqual([
      "Giant Steps",
      "Caprice 24"
    ]);
  });

  it("reflects and writes the enabled flag", async () => {
    const area = makeArea({ [ENABLED_KEY]: false });
    render(<App area={area} />);

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await vi.waitFor(async () => {
      expect(area.dump()[ENABLED_KEY]).toBe(true);
    });
  });

  it("opens a clicked video with a launch handoff and closes", async () => {
    const area = makeArea(seededStore);
    const launchAtOpen: unknown[] = [];
    const openTab = vi.fn(() => {
      launchAtOpen.push(area.dump()[LAUNCH_KEY]);
    });
    const closeWindow = vi.fn();
    render(<App area={area} openTab={openTab} closeWindow={closeWindow} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Open Caprice 24" })
    );

    await vi.waitFor(() => {
      expect(openTab).toHaveBeenCalledWith(
        "https://www.youtube.com/watch?v=vid1"
      );
    });
    expect(
      (launchAtOpen[0] as { videoId: string }).videoId
    ).toBe("vid1");
    expect(
      (area.dump()[LAUNCH_KEY] as { videoId: string }).videoId
    ).toBe("vid1");
    expect(closeWindow).toHaveBeenCalled();
  });

  it("deletes a video after two-stage confirm", async () => {
    const area = makeArea(seededStore);
    render(<App area={area} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Caprice 24" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete Caprice 24" })
    );

    expect(screen.queryByText("Caprice 24")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(area.dump()[keyFor("vid1")]).toBeUndefined();
      expect(area.dump()[keyFor("vid2")]).toBeDefined();
    });
  });

  it("shows the empty state with no saved videos", async () => {
    render(<App area={makeArea()} />);
    expect(
      await screen.findByText(
        "No saved videos yet. Save a loop on any YouTube video and it shows up here."
      )
    ).toBeInTheDocument();
  });

  it("creates a folder, files a video into it, and persists both", async () => {
    const area = makeArea(seededStore);
    render(<App area={area} />);

    fireEvent.click(await screen.findByRole("button", { name: "New folder" }));
    const input = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.change(input, { target: { value: "Paganini" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(
      await screen.findByRole("button", { name: "Paganini, 0 videos" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move Caprice 24 to folder" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Paganini" }));

    expect(
      screen.getByRole("button", { name: "Paganini, 1 video" })
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      const folders = area.dump()[FOLDERS_KEY] as { id: string; name: string }[];
      expect(folders.map((f) => f.name)).toEqual(["Paganini"]);
      expect(
        (area.dump()[keyFor("vid1")] as { folderId?: string }).folderId
      ).toBe(folders[0].id);
    });
  });

  it("New folder… from a move menu creates the folder with that video in it", async () => {
    const area = makeArea({
      ...seededStore,
      [FOLDERS_KEY]: [{ id: "f1", name: "Jazz", createdAt: 1 }]
    });
    render(<App area={area} />);

    fireEvent.click(await screen.findByRole("button", { name: "Move Caprice 24 to folder" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New folder…" }));
    const input = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.change(input, { target: { value: "Paganini" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      await screen.findByRole("button", { name: "Paganini, 1 video" })
    ).toBeInTheDocument();
  });

  it("deleting a folder keeps its videos, now under Unfiled", async () => {
    const area = makeArea({
      ...paganiniStore
    });
    render(<App area={area} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete folder Paganini" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete folder Paganini" })
    );

    // No folders left → flat list again, with both videos still there.
    expect(screen.getByText("Caprice 24")).toBeInTheDocument();
    expect(screen.getByText("Giant Steps")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(area.dump()[FOLDERS_KEY]).toEqual([]);
      const entry = area.dump()[keyFor("vid1")] as { folderId?: string; loops: unknown[] };
      expect(entry.folderId).toBeUndefined();
      expect(entry.loops).toHaveLength(1);
    });
  });

  it("remembers collapsed groups", async () => {
    const area = makeArea({
      ...paganiniStore,
      [COLLAPSED_GROUPS_KEY]: ["f1"]
    });
    render(<App area={area} />);

    const header = await screen.findByRole("button", { name: "Paganini, 1 video" });
    await vi.waitFor(() => expect(header).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByText("Caprice 24")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByText("Caprice 24")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(area.dump()[COLLAPSED_GROUPS_KEY]).toEqual([]);
    });
  });

  describe("search", () => {
    it("is hidden with no saved videos", async () => {
      render(<App area={makeArea({})} />);
      await screen.findByText(/No saved videos yet/);
      expect(screen.queryByRole("textbox", { name: "Search videos" })).not.toBeInTheDocument();
    });

    it("is autofocused and filters by title, mixed case", async () => {
      render(<App area={makeArea(seededStore)} />);
      const input = await screen.findByRole("textbox", { name: "Search videos" });
      expect(input).toHaveAttribute("placeholder", "Search videos");
      expect(input).toHaveFocus();

      fireEvent.change(input, { target: { value: "gIaNt" } });
      expect(screen.getByText("Giant Steps")).toBeInTheDocument();
      expect(screen.queryByText("Caprice 24")).not.toBeInTheDocument();
    });

    it("shows No videos match when nothing matches", async () => {
      render(<App area={makeArea(seededStore)} />);
      const input = await screen.findByRole("textbox", { name: "Search videos" });
      fireEvent.change(input, { target: { value: "zzz" } });
      expect(screen.getByText("No videos match")).toBeInTheDocument();
    });

    it("Escape and the clear button both clear", async () => {
      render(<App area={makeArea(seededStore)} />);
      const input = await screen.findByRole("textbox", { name: "Search videos" });

      fireEvent.change(input, { target: { value: "caprice" } });
      expect(screen.queryByText("Giant Steps")).not.toBeInTheDocument();
      fireEvent.keyDown(input, { key: "Escape" });
      expect(input).toHaveValue("");
      expect(screen.getByText("Giant Steps")).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "caprice" } });
      fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
      expect(input).toHaveValue("");
      expect(screen.getByText("Giant Steps")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });

    it("folder-name match shows the folder, not its non-matching videos", async () => {
      const area = makeArea({
        ...paganiniStore
      });
      render(<App area={area} />);
      const input = await screen.findByRole("textbox", { name: "Search videos" });
      await screen.findByRole("button", { name: "Paganini, 1 video" });

      fireEvent.change(input, { target: { value: "pagan" } });
      const header = screen.getByRole("button", { name: "Paganini, 1 video" });
      expect(header).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Caprice 24")).not.toBeInTheDocument();
      expect(screen.queryByText("Giant Steps")).not.toBeInTheDocument();
    });

    it("expands a collapsed folder with a match, leaving stored collapse state alone", async () => {
      const area = makeArea({
        ...paganiniStore,
        [COLLAPSED_GROUPS_KEY]: ["f1"]
      });
      render(<App area={area} />);
      const input = await screen.findByRole("textbox", { name: "Search videos" });
      const header = await screen.findByRole("button", { name: "Paganini, 1 video" });
      await vi.waitFor(() => expect(header).toHaveAttribute("aria-expanded", "false"));

      fireEvent.change(input, { target: { value: "caprice" } });
      expect(screen.getByText("Caprice 24")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Paganini, 1 video" }));
      expect(screen.queryByText("Caprice 24")).not.toBeInTheDocument();

      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.getByRole("button", { name: "Paganini, 1 video" })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
      expect(area.dump()[COLLAPSED_GROUPS_KEY]).toEqual(["f1"]);
    });

    it("opens a filtered result", async () => {
      const openTab = vi.fn();
      render(<App area={makeArea(seededStore)} openTab={openTab} closeWindow={() => {}} />);
      const input = await screen.findByRole("textbox", { name: "Search videos" });
      fireEvent.change(input, { target: { value: "steps" } });
      fireEvent.click(screen.getByRole("button", { name: "Open Giant Steps" }));
      await vi.waitFor(() =>
        expect(openTab).toHaveBeenCalledWith("https://www.youtube.com/watch?v=vid2")
      );
    });
  });
});
