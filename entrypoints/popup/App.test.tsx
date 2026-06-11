import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("popup App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides the page UI on the active tab", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 42 }]),
        sendMessage
      }
    });

    render(<App />);

    // Page UI shows by default, so the first action is to hide it.
    await userEvent.click(screen.getByRole("button", { name: "Hide page UI" }));

    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: "setEnabled",
      enabled: false
    });
  });
});
