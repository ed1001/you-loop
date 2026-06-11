import "./content/style.css";
import { setPageUiVisible } from "./content/pageUi";

type RuntimeMessage = {
  type: "setEnabled";
  enabled: boolean;
};

function isPageUiMessage(message: unknown): message is RuntimeMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "setEnabled" &&
    "enabled" in message &&
    typeof message.enabled === "boolean"
  );
}

function findYouTubePlayer() {
  return document.querySelector(".html5-video-player");
}

async function waitForYouTubePlayer() {
  const existing = findYouTubePlayer();
  if (existing != null) {
    return existing;
  }

  return await new Promise<Element>((resolve) => {
    const observer = new MutationObserver(() => {
      const player = findYouTubePlayer();
      if (player == null) {
        return;
      }

      observer.disconnect();
      resolve(player);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });
}

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  cssInjectionMode: "ui",
  async main() {
    // Register the receiver before any await so the popup can always reach the
    // content script, even while the player is still loading. setPageUiVisible
    // finds the video/timeline itself and ignores the host arg.
    browser.runtime.onMessage.addListener((message) => {
      if (!isPageUiMessage(message)) {
        return;
      }

      setPageUiVisible(document.body, message.enabled);
    });

    // Wait for the player so the video/timeline exist before showing the UI.
    await waitForYouTubePlayer();

    // Show the page UI by default once the player is ready; the popup toggles
    // it off.
    setPageUiVisible(document.body, true);
  },
});
