import {
  createInitialBackgroundState,
  reduceBackgroundState,
  type RuntimeMessage
} from "../shared/messaging/protocol";

export default defineBackground(() => {
  let state = createInitialBackgroundState();

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    const senderTabId = sender.tab?.id ?? null;
    state = reduceBackgroundState(state, message, senderTabId);
    return Promise.resolve({ ok: true, enabled: state.enabled });
  });
});
