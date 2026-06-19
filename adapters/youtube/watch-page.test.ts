import { describe, expect, it } from "vitest";
import { isYouTubeWatchPage } from "./watch-page";

describe("isYouTubeWatchPage", () => {
  it("is true on a watch URL with a video id", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/watch?v=abc123")).toBe(
      true
    );
  });

  it("is false on a watch URL without a video id", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/watch")).toBe(false);
  });

  it("is false on search results (inline preview player)", () => {
    expect(
      isYouTubeWatchPage("https://www.youtube.com/results?search_query=bach")
    ).toBe(false);
  });

  it("is false on a channel page (mini / trailer player)", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/@someone")).toBe(false);
  });

  it("is false on the home feed", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/")).toBe(false);
  });

  it("is false off the youtube host", () => {
    expect(isYouTubeWatchPage("https://example.com/watch?v=abc123")).toBe(false);
  });

  it("is false on a malformed url", () => {
    expect(isYouTubeWatchPage("not a url")).toBe(false);
  });
});
