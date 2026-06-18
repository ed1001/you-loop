import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpModal } from "./HelpModal";

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(ui: ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
});

describe("HelpModal", () => {
  it("renders nothing when closed", () => {
    const container = document.createElement("div");
    render(<HelpModal open={false} container={container} onClose={() => {}} />);
    expect(container.querySelector(".you-loop-help-card")).toBeNull();
  });

  it("renders nothing when there is no container", () => {
    render(<HelpModal open container={null} onClose={() => {}} />);
    expect(document.querySelector(".you-loop-help-card")).toBeNull();
  });

  it("portals the card into the given container with panel + keyboard docs", () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(<HelpModal open container={container} onClose={() => {}} />);

    const card = container.querySelector(".you-loop-help-card");
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("Zoom");
    expect(card!.textContent).toContain("Magnify the looped region");
    const keys = Array.from(container.querySelectorAll(".you-loop-kbd")).map(
      (el) => el.textContent
    );
    expect(keys).toEqual(["A", "S", "D", "[ ]", "⇧ [ ]", "⇧ drag"]);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);
    fireEvent.click(container.querySelector(".you-loop-help-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the card itself is clicked", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);
    fireEvent.click(container.querySelector(".you-loop-help-card")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);
    fireEvent.click(container.querySelector(".you-loop-help-close")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onClose = vi.fn();
    render(<HelpModal open container={container} onClose={onClose} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("documents the window step and nudge keys", () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(<HelpModal open container={container} onClose={() => {}} />);
    const card = container.querySelector(".you-loop-help-card");
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("Step window");
    expect(card!.textContent).toContain("Nudge window");
    expect(card!.textContent).toContain("Move window");
  });
});
