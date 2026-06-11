import "./content/style.css";
import { setPageUiVisible } from "./content/pageUi";

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
    // Wait for the player so the video/timeline exist, then show the page UI.
    await waitForYouTubePlayer();
    setPageUiVisible(document.body, true);
  },
});
