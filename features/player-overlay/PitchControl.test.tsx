import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PitchControl } from "./PitchControl";
import { PX_PER_SEMITONE } from "../pitch/pitchScrub";

const base = {
  settings: { semitones: 0, cents: 0 },
  enabled: false,
  available: true,
  disabled: false,
  container: document.body,
  onChange: () => {},
  onToggleEnabled: () => {},
  onReset: () => {}
};

afterEach(() => cleanup());

describe("PitchControl", () => {
  it("shows the formatted offset on the slider", () => {
    render(<PitchControl {...base} settings={{ semitones: 3, cents: 0 }} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "+3");
  });

  it("a plain click opens the popover", () => {
    render(<PitchControl {...base} />);
    const chip = screen.getByRole("slider");
    fireEvent.pointerDown(chip, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(chip, { pointerId: 1, clientY: 100 });
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("dragging up raises semitones", () => {
    const onChange = vi.fn();
    render(<PitchControl {...base} onChange={onChange} />);
    const chip = screen.getByRole("slider");
    fireEvent.pointerDown(chip, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientY: 100 - PX_PER_SEMITONE });
    expect(onChange).toHaveBeenCalledWith({ semitones: 1, cents: 0 });
  });

  it("reset and on/off in the popover call their handlers", () => {
    const onReset = vi.fn();
    const onToggleEnabled = vi.fn();
    render(
      <PitchControl
        {...base}
        settings={{ semitones: 3, cents: 0 }}
        onReset={onReset}
        onToggleEnabled={onToggleEnabled}
      />
    );
    const chip = screen.getByRole("slider");
    fireEvent.pointerDown(chip, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(chip, { pointerId: 1, clientY: 100 });
    fireEvent.click(screen.getByText("Reset"));
    fireEvent.click(screen.getByRole("switch"));
    expect(onReset).toHaveBeenCalled();
    expect(onToggleEnabled).toHaveBeenCalled();
  });
});
