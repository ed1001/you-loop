import "./content/style.css";
import { setPageUiVisible } from "./content/pageUi";

type RuntimeMessage = {
  type: "you-loop:set-page-ui-visible";
  visible: boolean;
};

function isPageUiMessage(message: unknown): message is RuntimeMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "you-loop:set-page-ui-visible" &&
    "visible" in message &&
    typeof message.visible === "boolean"
  );
}

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "you-loop-page-ui",
      position: "inline",
      anchor: "body",
      onMount: (container) => container,
    });

    ui.mount();

    browser.runtime.onMessage.addListener((message) => {
      if (!isPageUiMessage(message)) {
        return;
      }

      setPageUiVisible(ui.uiContainer, message.visible);
    });
  },
});
