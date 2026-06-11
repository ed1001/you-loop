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
  async main(ctx) {
    const player = await waitForYouTubePlayer();
    const ui = await createShadowRootUi(ctx, {
      name: "you-loop-page-ui",
      position: "inline",
      anchor: () => player,
      onMount: (container, _shadow, shadowHost) => {
        const anchor = shadowHost.parentElement;

        if (anchor != null && getComputedStyle(anchor).position === "static") {
          anchor.style.position = "relative";
        }

        shadowHost.style.position = "absolute";
        shadowHost.style.inset = "0";
        shadowHost.style.zIndex = "2147483647";
        shadowHost.style.pointerEvents = "none";

        return container;
      },
    });

    ui.mount();

    browser.runtime.onMessage.addListener((message) => {
      if (!isPageUiMessage(message)) {
        return;
      }

      setPageUiVisible(ui.uiContainer, message.enabled);
    });
  },
});
