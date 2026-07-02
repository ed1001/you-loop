import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PitchControl } from "./PitchControl";
import {
  PX_PER_CENT,
  PX_PER_SEMITONE,
  RESET_ARM_DX
} from "../pitch/pitchScrub";

const base = {
  settings: { semitones: 0, cents: 0 },
  available: true,
  disabled: false,
  container: document.body,
  onChange: () => {},
  onReset: () => {}
};

function renderChip(overrides: Partial<typeof base> = {}) {
  render(<PitchControl {...base} {...overrides} />);
  return screen.getByRole("slider");
}

const press = (chip: HTMLElement) =>
  fireEvent.pointerDown(chip, { pointerId: 1, clientX: 100, clientY: 100 });

const moveBy = (chip: HTMLElement, dx: number, dy: number, shiftKey = false) =>
  fireEvent.pointerMove(chip, {
    pointerId: 1,
    clientX: 100 + dx,
    clientY: 100 + dy,
    shiftKey
  });

const releaseAt = (chip: HTMLElement, dx: number, dy: number) =>
  fireEvent.pointerUp(chip, {
    pointerId: 1,
    clientX: 100 + dx,
    clientY: 100 + dy
  });

// Latch the cents gear and trim +10¢: the first shifted move only flips the
// gear (rebasing at its travel), the second one trims.
const trimTenCents = (chip: HTMLElement) => {
  moveBy(chip, 0, 0, true);
  moveBy(chip, 0, -PX_PER_CENT * 10, true);
};

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

  it("a plain click changes nothing", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const chip = renderChip({ onChange, onReset });
    press(chip);
    releaseAt(chip, 0, 0);
    expect(onChange).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("flinging right and releasing resets a non-zero offset", () => {
    const onReset = vi.fn();
    const chip = renderChip({ settings: { semitones: 3, cents: 0 }, onReset });
    press(chip);
    moveBy(chip, RESET_ARM_DX, 0);
    releaseAt(chip, RESET_ARM_DX, 0);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("holding shift switches to cents gear; vertical then trims cents", () => {
    const onChange = vi.fn();
    const chip = renderChip({ onChange });
    press(chip);
    trimTenCents(chip);
    expect(onChange).toHaveBeenCalledWith({ semitones: 0, cents: 10 });
    expect(
      document.querySelector('.you-loop-pitch-pop[data-fine="true"]')
    ).not.toBeNull();
  });

  it("releasing shift leaves cents gear and resumes semitone scrub", () => {
    const onChange = vi.fn();
    const chip = renderChip({ onChange });
    press(chip);
    trimTenCents(chip);
    // Shift released: gear returns to semitones...
    moveBy(chip, 0, -PX_PER_CENT * 10);
    expect(
      document.querySelector('.you-loop-pitch-pop[data-fine="true"]')
    ).toBeNull();
    // ...and vertical travel from the crossover moves semitones again,
    // keeping the cents trimmed in fine gear.
    moveBy(chip, 0, -PX_PER_CENT * 10 - PX_PER_SEMITONE);
    expect(onChange).toHaveBeenLastCalledWith({ semitones: 1, cents: 0 });
  });

  it("a stationary shift press flips the gear via the keyboard", () => {
    const chip = renderChip();
    press(chip);
    fireEvent.keyDown(window, { key: "Shift" });
    expect(
      document.querySelector('.you-loop-pitch-pop[data-fine="true"]')
    ).not.toBeNull();
    fireEvent.keyUp(window, { key: "Shift" });
    expect(
      document.querySelector('.you-loop-pitch-pop[data-fine="true"]')
    ).toBeNull();
  });

  it("pressing with shift already held opens straight onto cents gear", () => {
    const onChange = vi.fn();
    const chip = renderChip({ onChange });
    fireEvent.pointerDown(chip, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      shiftKey: true
    });
    expect(
      document.querySelector('.you-loop-pitch-pop[data-fine="true"]')
    ).not.toBeNull();
    moveBy(chip, 0, -PX_PER_CENT * 5, true);
    expect(onChange).toHaveBeenCalledWith({ semitones: 0, cents: 5 });
  });

  it("shows a decimal readout when a fine trim is applied", () => {
    renderChip({ settings: { semitones: 3, cents: 45 } });
    expect(
      document.querySelector(".you-loop-pitch-num")?.textContent
    ).toBe("+3.45st");
  });

  it("flinging right in cents gear zeroes the cents without a release", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const chip = renderChip({
      settings: { semitones: 3, cents: 10 },
      onChange,
      onReset
    });
    press(chip);
    moveBy(chip, 0, 0, true); // latch cents gear
    moveBy(chip, RESET_ARM_DX, 0, true); // arm the fine reset
    expect(onChange).toHaveBeenCalledWith({ semitones: 3, cents: 0 });
    expect(onReset).not.toHaveBeenCalled();
    // Drag still alive: the popover is up and back-out + vertical trims again.
    expect(document.querySelector(".you-loop-speed-rail")).not.toBeNull();
    moveBy(chip, 0, -PX_PER_CENT * 5, true);
    expect(onChange).toHaveBeenLastCalledWith({ semitones: 3, cents: 5 });
  });

  it("the fine snap fires once per excursion", () => {
    const onChange = vi.fn();
    const chip = renderChip({
      settings: { semitones: 0, cents: 10 },
      onChange
    });
    press(chip);
    moveBy(chip, 0, 0, true);
    moveBy(chip, RESET_ARM_DX, 0, true);
    expect(onChange).toHaveBeenCalledTimes(1);
    // Holding past the threshold must not re-fire.
    moveBy(chip, RESET_ARM_DX + 20, 0, true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("a fine fling does not arm the coarse reset after shift is released", () => {
    const onReset = vi.fn();
    const chip = renderChip({ settings: { semitones: 3, cents: 0 }, onReset });
    press(chip);
    moveBy(chip, 0, 0, true);
    moveBy(chip, RESET_ARM_DX, 0, true); // rightward travel spent in fine gear
    moveBy(chip, RESET_ARM_DX, 0); // shift up: coarse gear, X rebased
    releaseAt(chip, RESET_ARM_DX, 0);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("does not reset from cents gear even after a rightward swing", () => {
    const onReset = vi.fn();
    const chip = renderChip({ settings: { semitones: 3, cents: 0 }, onReset });
    press(chip);
    moveBy(chip, RESET_ARM_DX, 0, true);
    fireEvent.pointerUp(chip, {
      pointerId: 1,
      clientX: 100 + RESET_ARM_DX,
      clientY: 100,
      shiftKey: true
    });
    expect(onReset).not.toHaveBeenCalled();
  });

  it("the popover anchor ignores the chip's scrub scale-up", () => {
    const chip = renderChip();
    // Chip layout box: 54×27 at (100, 200). While scrubbing, CSS scales the
    // chip 1.12× about its center — the measured rect grows, the layout box
    // doesn't. The anchor must not move between the press (unscaled) and the
    // first move (scaled), or the popover visibly hops.
    Object.defineProperty(chip, "offsetHeight", { value: 27 });
    let scaled = false;
    chip.getBoundingClientRect = () =>
      scaled
        ? new DOMRect(96.76, 198.38, 60.48, 30.24)
        : new DOMRect(100, 200, 54, 27);
    press(chip);
    const pop = document.querySelector<HTMLElement>(".you-loop-pitch-pop");
    const before = { left: pop?.style.left, top: pop?.style.top };
    scaled = true;
    moveBy(chip, 0, -PX_PER_SEMITONE);
    expect(pop?.style.left).toBe(before.left);
    expect(pop?.style.top).toBe(before.top);
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
