import { afterEach, describe, expect, it } from "vitest";
import {
  findYouTubeVideo,
  getVideoIdFromUrl,
  getVideoTitle,
  measureTimeline
} from "./adapter";

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

// A detached root lets each case control exactly which title sources exist.
function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("getVideoTitle", () => {
  afterEach(() => {
    document.title = "";
  });

  it("prefers the watch-metadata heading over og:title", () => {
    const el = root(`
      <meta property="og:title" content="Meta Title" />
      <ytd-watch-metadata><h1><span>Heading Title</span></h1></ytd-watch-metadata>
    `);
    expect(getVideoTitle(el)).toBe("Heading Title");
  });

  it("falls back to og:title when there is no heading", () => {
    const el = root(`<meta property="og:title" content="Meta Title" />`);
    expect(getVideoTitle(el)).toBe("Meta Title");
  });

  it("falls back to the document title, stripping the YouTube suffix", () => {
    document.title = "Some Song - YouTube";
    expect(getVideoTitle(root(""))).toBe("Some Song");
  });

  it("returns null when nothing usable is present", () => {
    expect(getVideoTitle(root(""))).toBeNull();
  });

  it("caps an over-long title at 100 characters", () => {
    const long = "a".repeat(150);
    const el = root(`<ytd-watch-metadata><h1>${long}</h1></ytd-watch-metadata>`);
    expect(getVideoTitle(el)).toHaveLength(100);
  });
});
