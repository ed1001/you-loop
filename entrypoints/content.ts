import "./content/style.css";
import { setPageUiVisible } from "./content/pageUi";
import { isYouTubeWatchPage } from "../adapters/youtube/watch-page";
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
    // unless the user switched Étude off in the popup.
    await waitForYouTubePlayer();

    // Re-applied on toggle and on SPA navigation: mounting is idempotent and
    // scoped to the watch page, so the panel returns as soon as a timeline
    // exists again (e.g. disable → navigate home → enable → open a video).
    // Scoping to /watch keeps Étude off inline preview / mini / channel-trailer
    // players, which also use `.html5-video-player` but aren't the main video.
    let desired = true;
    const apply = () =>
      setPageUiVisible(document.body, desired && isYouTubeWatchPage());

    // Watch before the initial read so a toggle racing the read isn't lost.
    watchEnabled((enabled) => {
      desired = enabled;
      apply();
    });
    desired = await getEnabled();
    apply();
    document.addEventListener("yt-navigate-finish", apply);
  },
});
