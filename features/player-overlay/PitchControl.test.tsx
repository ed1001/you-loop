import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PitchControl } from "./PitchControl";
import {
  FINE_ARM_DX,
  PX_PER_CENT,
  PX_PER_SEMITONE,
  RESET_ARM_DX
} from "../pitch/pitchScrub";

const base = {
  settings: { semitones: 0, cents: 0 },
  enabled: true,
  available: true,
  disabled: false,
  container: document.body,
  onChange: () => {},
  onToggleEnabled: () => {},
  onReset: () => {}
};

function renderChip(overrides: Partial<typeof base> = {}) {
  render(<PitchControl {...base} {...overrides} />);
  return screen.getByRole("slider");
}

const press = (chip: HTMLElement) =>
  fireEvent.pointerDown(chip, { pointerId: 1, clientX: 100, clientY: 100 });

const moveBy = (chip: HTMLElement, dx: number, dy: number) =>
  fireEvent.pointerMove(chip, {
    pointerId: 1,
    clientX: 100 + dx,
    clientY: 100 + dy
  });

const releaseAt = (chip: HTMLElement, dx: number, dy: number) =>
  fireEvent.pointerUp(chip, {
    pointerId: 1,
    clientX: 100 + dx,
    clientY: 100 + dy
  });

afterEach(() => cleanup());

describe("PitchControl", () => {
  it("shows the formatted offset on the slider", () => {
    const chip = renderChip({ settings: { semitones: 3, cents: 12 } });
    expect(chip).toHaveAttribute("aria-valuetext", "+3 +12¢");
  });

  it("dragging up raises semitones and shows the tape", () => {
    const onChange = vi.fn();
    const chip = renderChip({ onChange });
    press(chip);
    moveBy(chip, 0, -PX_PER_SEMITONE);
    expect(onChange).toHaveBeenCalledWith({ semitones: 1, cents: 0 });
    expect(document.querySelector(".you-loop-speed-rail")).not.toBeNull();
  });

  it("a plain click toggles the bypass", () => {
    const onToggleEnabled = vi.fn();
    const chip = renderChip({ onToggleEnabled });
    press(chip);
    releaseAt(chip, 0, 0);
    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
  });

  it("flinging right and releasing resets a non-zero offset", () => {
    const onReset = vi.fn();
    const chip = renderChip({ settings: { semitones: 3, cents: 0 }, onReset });
    press(chip);
    moveBy(chip, RESET_ARM_DX, 0);
    releaseAt(chip, RESET_ARM_DX, 0);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("dragging left latches cents gear; vertical then trims cents", () => {
    const onChange = vi.fn();
    const chip = renderChip({ onChange });
    press(chip);
    moveBy(chip, -FINE_ARM_DX, 0);
    // Latched: subsequent vertical travel moves cents, not semitones.
    moveBy(chip, -FINE_ARM_DX, -PX_PER_CENT * 10);
    expect(onChange).toHaveBeenCalledWith({ semitones: 0, cents: 10 });
    expect(
      document.querySelector('.you-loop-pitch-pop[data-fine="true"]')
    ).not.toBeNull();
  });

  it("does not reset from cents gear even after a rightward swing", () => {
    const onReset = vi.fn();
    const chip = renderChip({ settings: { semitones: 3, cents: 0 }, onReset });
    press(chip);
    moveBy(chip, -FINE_ARM_DX, 0);
    releaseAt(chip, RESET_ARM_DX, 0);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("keyboard: arrows move semitones, shift+arrows trim cents, Enter resets", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const chip = renderChip({
      settings: { semitones: 2, cents: 0 },
      onChange,
      onReset
    });
    fireEvent.keyDown(chip, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith({ semitones: 3, cents: 0 });
    fireEvent.keyDown(chip, { key: "ArrowDown", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith({ semitones: 2, cents: -5 });
    fireEvent.keyDown(chip, { key: "Enter" });
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
