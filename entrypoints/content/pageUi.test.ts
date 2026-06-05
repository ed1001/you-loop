/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { describe, expect, test } from "vitest";
import { createPageUiElement, setPageUiVisible } from "./pageUi";

describe("page UI", () => {
  test("adds and removes the You Loop page UI", () => {
    const host = document.createElement("div");
    document.body.append(host);

    setPageUiVisible(host, true);

    expect(host.querySelector("[data-you-loop-page-ui]")).toBeInTheDocument();
    expect(host).toHaveTextContent("You Loop UI on");

    setPageUiVisible(host, false);

    expect(host.querySelector("[data-you-loop-page-ui]")).not.toBeInTheDocument();
  });

  test("creates only one page UI element", () => {
    const host = document.createElement("div");

    host.append(createPageUiElement());
    setPageUiVisible(host, true);

    expect(host.querySelectorAll("[data-you-loop-page-ui]")).toHaveLength(1);
  });
});
