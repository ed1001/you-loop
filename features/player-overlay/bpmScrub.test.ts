import { describe, expect, it } from "vitest";
import {
  BPM_WINDOW_PX,
  PX_PER_BPM,
  bpmFromDrag,
  isLabeledBpm,
  tapeOffset,
  tapeStops,
  tapeY
} from "./bpmScrub";
import { MAX_BPM, MIN_BPM } from "../playback/tapTempo";

describe("bpmScrub", () => {
  it("raises BPM when dragging up", () => {
    expect(bpmFromDrag(100, 40)).toBe(100 + 40 / PX_PER_BPM); // +10
  });

  it("lowers BPM when dragging down (negative dyUp)", () => {
    expect(bpmFromDrag(100, -40)).toBe(90);
  });

  it("clamps to the BPM range", () => {
    expect(bpmFromDrag(MAX_BPM, 400)).toBe(MAX_BPM);
    expect(bpmFromDrag(MIN_BPM, -400)).toBe(MIN_BPM);
  });

  it("centers the current BPM under the needle", () => {
    expect(tapeY(MIN_BPM)).toBe(0);
    expect(tapeOffset(MIN_BPM)).toBe(BPM_WINDOW_PX / 2);
  });

  it("lists tick stops across the whole range", () => {
    const stops = tapeStops();
    expect(stops[0]).toBe(MIN_BPM);
    expect(stops[stops.length - 1]).toBe(MAX_BPM);
    expect(stops.every((s) => s >= MIN_BPM && s <= MAX_BPM)).toBe(true);
  });

  it("labels only multiples of 20", () => {
    expect(isLabeledBpm(100)).toBe(true);
    expect(isLabeledBpm(105)).toBe(false);
  });
});
