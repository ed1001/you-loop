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

describe("CountInControl", () => {
  it("toggles on click", () => {
    const onToggle = vi.fn();
    render(<CountInControl {...base} onToggle={onToggle} />);
    const btn = host!.querySelector(".you-loop-countin-toggle") as HTMLElement;
    act(() => fireEvent.click(btn));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects the on state with data-on", () => {
    render(<CountInControl {...base} on={true} container={document.body} />);
    const btn = host!.querySelector(".you-loop-countin-toggle") as HTMLElement;
    expect(btn.dataset.on).toBe("true");
  });

  it("computes BPM from taps and reports it", () => {
    const onSettingsChange = vi.fn();
    let t = 0;
    render(
      <CountInControl
        {...base}
        on={true}
        container={document.body}
        onSettingsChange={onSettingsChange}
        now={() => (t += 500)} // each call advances 500ms → 120 BPM
      />
    );
    const pad = document.body.querySelector(".you-loop-countin-tap") as HTMLElement;
    act(() => { fireEvent.click(pad); fireEvent.click(pad); fireEvent.click(pad); });
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 120 })
    );
  });

  it("changes time signature", () => {
    const onSettingsChange = vi.fn();
    render(
      <CountInControl {...base} on={true} container={document.body} onSettingsChange={onSettingsChange} />
    );
    const threeFour = document.body.querySelector('[data-sig="3"]') as HTMLElement;
    act(() => fireEvent.click(threeFour));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ beatsPerBar: 3, noteValue: 4 })
    );
  });

  it("changes bar count", () => {
    const onSettingsChange = vi.fn();
    render(
      <CountInControl {...base} on={true} container={document.body} onSettingsChange={onSettingsChange} />
    );
    const twoBars = document.body.querySelector('[data-bars="2"]') as HTMLElement;
    act(() => fireEvent.click(twoBars));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bars: 2 })
    );
  });
});
