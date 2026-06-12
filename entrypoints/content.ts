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
    // unless the user switched Étude off in the popup.
    await waitForYouTubePlayer();

    // Re-applied on toggle and on SPA navigation: mounting is idempotent and
    // no-ops off watch pages, so the panel returns as soon as a timeline
    // exists again (e.g. disable → navigate home → enable → open a video).
    let desired = true;
    const apply = () => setPageUiVisible(document.body, desired);

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
