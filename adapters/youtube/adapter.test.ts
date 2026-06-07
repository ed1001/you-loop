import { describe, expect, it } from "vitest";
import { findYouTubeVideo, getVideoIdFromUrl, measureTimeline } from "./adapter";

describe("youtube adapter", () => {
  it("extracts watch video id", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "abc123"
    );
    expect(getVideoIdFromUrl("https://www.youtube.com/shorts/abc123")).toBeNull();
  });

  it("finds html video element", () => {
    document.body.innerHTML = `<video></video>`;
    expect(findYouTubeVideo()).toBeInstanceOf(HTMLVideoElement);
  });

  it("returns null when timeline is missing", () => {
    document.body.innerHTML = `<div></div>`;
    expect(measureTimeline()).toBeNull();
  });
});
