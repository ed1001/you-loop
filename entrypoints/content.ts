import "./content/style.css";
import { setPageUiVisible } from "./content/pageUi";
import { getEnabled, watchEnabled } from "../features/persistence/settingsStore";

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
    // Wait for the player so the video/timeline exist, then show the page UI —
    // unless the user switched Étude off in the popup. The watcher handles
    // live toggles from the popup while the tab stays open.
    await waitForYouTubePlayer();
    if (await getEnabled()) {
      setPageUiVisible(document.body, true);
    }
    watchEnabled((enabled) => setPageUiVisible(document.body, enabled));
  },
});
