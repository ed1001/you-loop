// features/player-overlay/CountInControl.test.tsx
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountInControl } from "./CountInControl";
import { DEFAULT_COUNT_IN_SETTINGS } from "../persistence/countInStore";

let root: Root | null = null;
let host: HTMLElement | null = null;

// fallow-ignore-next-line code-duplication
function render(ui: ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const base = {
  enabled: true,
  on: false,
  settings: DEFAULT_COUNT_IN_SETTINGS,
  container: null as HTMLElement | null,
  disabled: false,
  onToggle: vi.fn(),
  onSettingsChange: vi.fn()
};

const toggleBtn = () =>
  host!.querySelector(".you-loop-countin-toggle") as HTMLElement;
const popover = () =>
  document.body.querySelector(".you-loop-countin-pop") as HTMLElement | null;
const openPopover = () => act(() => fireEvent.click(toggleBtn()));

// The popover unmounts after its exit animation (a close timer), so close
// assertions advance fake timers past it.
const settleClose = () => act(() => void vi.advanceTimersByTime(200));

describe("CountInControl", () => {
  it("opens the popover on button click and closes it on a second click", () => {
    vi.useFakeTimers();
    render(<CountInControl {...base} container={document.body} />);
    expect(popover()).toBeNull();
    openPopover();
    expect(popover()).not.toBeNull();
    act(() => fireEvent.click(toggleBtn()));
    // Exit animation: stays mounted (closing) until the timer elapses.
    expect(popover()!.dataset.closing).toBe("true");
    settleClose();
    expect(popover()).toBeNull();
    vi.useRealTimers();
  });

  it("does NOT toggle on/off from the pill button (only the switch does)", () => {
    const onToggle = vi.fn();
    render(<CountInControl {...base} container={document.body} onToggle={onToggle} />);
    openPopover();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("reflects the on state with data-on", () => {
    render(<CountInControl {...base} on={true} container={document.body} />);
    expect(toggleBtn().dataset.on).toBe("true");
  });

  it("toggles count-in from the switch inside the popover", () => {
    const onToggle = vi.fn();
    render(<CountInControl {...base} container={document.body} onToggle={onToggle} />);
    openPopover();
    const sw = document.body.querySelector(".you-loop-countin-switch") as HTMLElement;
    act(() => fireEvent.click(sw));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("dismisses the popover on an outside pointerdown", () => {
    vi.useFakeTimers();
    render(<CountInControl {...base} container={document.body} />);
    openPopover();
    expect(popover()).not.toBeNull();
    const outside = document.createElement("div");
    document.body.append(outside);
    act(() => fireEvent.pointerDown(outside));
    settleClose();
    expect(popover()).toBeNull();
    outside.remove();
    vi.useRealTimers();
  });

  it("dismisses the popover on Escape", () => {
    vi.useFakeTimers();
    render(<CountInControl {...base} container={document.body} />);
    openPopover();
    expect(popover()).not.toBeNull();
    act(() => fireEvent.keyDown(document, { key: "Escape" }));
    settleClose();
    expect(popover()).toBeNull();
    vi.useRealTimers();
  });

  it("keeps the popover open when clicking inside it", () => {
    render(<CountInControl {...base} container={document.body} />);
    openPopover();
    const pad = document.body.querySelector(".you-loop-countin-tap") as HTMLElement;
    act(() => fireEvent.pointerDown(pad));
    expect(popover()).not.toBeNull();
  });

  it("shows visible section labels", () => {
    render(<CountInControl {...base} container={document.body} />);
    openPopover();
    const text = popover()!.textContent ?? "";
    expect(text).toContain("Tempo");
    expect(text).toContain("Time signature");
    expect(text).toContain("Bars");
  });

  it("computes BPM from taps and reports it", () => {
    const onSettingsChange = vi.fn();
    let t = 0;
    render(
      <CountInControl
        {...base}
        container={document.body}
        onSettingsChange={onSettingsChange}
        now={() => (t += 500)} // each call advances 500ms → 120 BPM
      />
    );
    openPopover();
    const pad = document.body.querySelector(".you-loop-countin-tap") as HTMLElement;
    act(() => { fireEvent.click(pad); fireEvent.click(pad); fireEvent.click(pad); });
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 120 })
    );
  });

  it("changes time signature", () => {
    const onSettingsChange = vi.fn();
    render(<CountInControl {...base} container={document.body} onSettingsChange={onSettingsChange} />);
    openPopover();
    const threeFour = document.body.querySelector('[data-sig="3"]') as HTMLElement;
    act(() => fireEvent.click(threeFour));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ beatsPerBar: 3, noteValue: 4 })
    );
  });

  it("changes bar count", () => {
    const onSettingsChange = vi.fn();
    render(<CountInControl {...base} container={document.body} onSettingsChange={onSettingsChange} />);
    openPopover();
    const twoBars = document.body.querySelector('[data-bars="2"]') as HTMLElement;
    act(() => fireEvent.click(twoBars));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bars: 2 })
    );
  });
});

describe("CountInControl BPM rail keyboard", () => {
  const rail = () =>
    document.body.querySelector(".you-loop-countin-rail") as HTMLElement;

  it("ArrowUp/ArrowDown nudge BPM by 1", () => {
    const onSettingsChange = vi.fn();
    render(
      <CountInControl {...base} container={document.body} onSettingsChange={onSettingsChange} />
    );
    openPopover();
    act(() => fireEvent.keyDown(rail(), { key: "ArrowUp" }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: DEFAULT_COUNT_IN_SETTINGS.bpm + 1 })
    );
    act(() => fireEvent.keyDown(rail(), { key: "ArrowDown" }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: DEFAULT_COUNT_IN_SETTINGS.bpm - 1 })
    );
  });

  it("Shift+arrow nudges by 5", () => {
    const onSettingsChange = vi.fn();
    render(
      <CountInControl {...base} container={document.body} onSettingsChange={onSettingsChange} />
    );
    openPopover();
    act(() => fireEvent.keyDown(rail(), { key: "ArrowUp", shiftKey: true }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: DEFAULT_COUNT_IN_SETTINGS.bpm + 5 })
    );
  });

  it("other keys are ignored", () => {
    const onSettingsChange = vi.fn();
    render(
      <CountInControl {...base} container={document.body} onSettingsChange={onSettingsChange} />
    );
    openPopover();
    act(() => fireEvent.keyDown(rail(), { key: "ArrowLeft" }));
    expect(onSettingsChange).not.toHaveBeenCalled();
  });
});
