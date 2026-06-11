import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setPageUiVisible } from "./pageUi";

describe("page UI", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows player overlay controls when enabled on a page with a video", () => {
    const host = document.createElement("div");
    const video = document.createElement("video");
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 120
    });
    document.body.append(host, video);

    setPageUiVisible(host, true);

    expect(
      screen.getByLabelText("You Loop controls")
    ).toBeInTheDocument();
  });

  it("removes player overlay controls when disabled", () => {
    const host = document.createElement("div");
    const video = document.createElement("video");
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 120
    });
    document.body.append(host, video);

    setPageUiVisible(host, true);
    setPageUiVisible(host, false);

    expect(
      screen.queryByLabelText("You Loop controls")
    ).not.toBeInTheDocument();
  });

});
