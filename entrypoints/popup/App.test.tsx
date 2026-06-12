import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAVED_STORE_KEY, type StorageArea } from "../../features/persistence/loopStore";
import { ENABLED_KEY, LAUNCH_KEY } from "../../features/persistence/settingsStore";
import { App } from "./App";

function makeArea(
  initial: Record<string, unknown> = {}
): StorageArea & { dump: () => Record<string, unknown> } {
  let data: Record<string, unknown> = { ...initial };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      data = { ...data, ...items };
    },
    dump: () => data
  };
}

const seededStore = {
  [SAVED_STORE_KEY]: {
    vid1: {
      loops: [{ id: "l1", name: "A", main: { start: 1, end: 2 }, zoom: null }],
      lastUsedId: "l1",
      lastSeen: 10,
      title: "Caprice 24"
    },
    vid2: {
      loops: [
        { id: "l2", name: "B", main: { start: 3, end: 4 }, zoom: null },
        { id: "l3", name: "C", main: { start: 5, end: 6 }, zoom: null }
      ],
      lastUsedId: "l2",
      lastSeen: 20,
      title: "Giant Steps"
    }
  }
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
      const store = area.dump()[SAVED_STORE_KEY] as Record<string, unknown>;
      expect(store["vid1"]).toBeUndefined();
      expect(store["vid2"]).toBeDefined();
    });
  });

  it("shows the empty state with no saved videos", async () => {
    render(<App area={makeArea()} />);
    expect(
      await screen.findByText(
        "No saved videos yet. Videos with saved loops appear here."
      )
    ).toBeInTheDocument();
  });
});
