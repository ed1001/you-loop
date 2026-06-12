import { describe, expect, it } from "vitest";
import {
  PX_PER_STEP,
  RESET_ARM_DX,
  RESET_REVEAL_DX,
  TAPE_WINDOW_PX,
  rateFromDrag,
  resetProgress,
  tapeOffset,
  tapeStops,
  tapeY
} from "./speedScrub";

describe("rateFromDrag", () => {
  it("returns the start rate inside the first half-step", () => {
    expect(rateFromDrag(1, 0)).toBe(1);
    expect(rateFromDrag(1, PX_PER_STEP / 2 - 1)).toBe(1);
    expect(rateFromDrag(1, -(PX_PER_STEP / 2 - 1))).toBe(1);
  });

  it("steps 0.05 per PX_PER_STEP of upward drag", () => {
    expect(rateFromDrag(1, PX_PER_STEP)).toBe(1.05);
    expect(rateFromDrag(1, PX_PER_STEP * 8)).toBe(1.4);
    expect(rateFromDrag(1, -PX_PER_STEP * 3)).toBe(0.85);
  });

  it("clamps at the range ends", () => {
    expect(rateFromDrag(1, PX_PER_STEP * 1000)).toBe(3);
    expect(rateFromDrag(1, -PX_PER_STEP * 1000)).toBe(0.25);
  });

  it("stays float-exact across many steps", () => {
    expect(rateFromDrag(0.25, PX_PER_STEP * 11)).toBe(0.8);
    expect(rateFromDrag(2.95, PX_PER_STEP)).toBe(3);
  });
});

describe("resetProgress", () => {
  it("is zero inside the dead zone (including leftward drags)", () => {
    expect(resetProgress(-50)).toBe(0);
    expect(resetProgress(0)).toBe(0);
    expect(resetProgress(RESET_REVEAL_DX)).toBe(0);
  });

  it("ramps between reveal and arm thresholds", () => {
    const mid = (RESET_REVEAL_DX + RESET_ARM_DX) / 2;
    expect(resetProgress(mid)).toBeCloseTo(0.5);
  });

  it("saturates at 1 from the arm threshold onward", () => {
    expect(resetProgress(RESET_ARM_DX)).toBe(1);
    expect(resetProgress(RESET_ARM_DX * 3)).toBe(1);
  });
});

describe("tape geometry", () => {
  it("maps the range ends to the tape ends", () => {
    expect(tapeY(0.25)).toBe(0);
    expect(tapeY(3)).toBe(55 * PX_PER_STEP);
  });

  it("centers the current rate under the needle", () => {
    expect(tapeOffset(0.25)).toBe(TAPE_WINDOW_PX / 2);
    expect(tapeOffset(1)).toBe(TAPE_WINDOW_PX / 2 - 15 * PX_PER_STEP);
  });

  it("emits every 0.05 stop from 0.25 to 3 exactly", () => {
    const stops = tapeStops();
    expect(stops).toHaveLength(56);
    expect(stops[0]).toBe(0.25);
    expect(stops).toContain(1);
    expect(stops).toContain(2.85);
    expect(stops[stops.length - 1]).toBe(3);
  });
});
