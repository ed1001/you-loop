import {
  createInitialBackgroundState,
  reduceBackgroundState,
  type RuntimeMessage
} from "../shared/messaging/protocol";
import { migrateToSync } from "../features/persistence/migrate";

export default defineBackground(() => {
  // One-time move of saved loops from storage.local to storage.sync. Fire and
  // forget: it guards itself and retries on a later startup if it fails.
  void migrateToSync();

  let state = createInitialBackgroundState();

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    const senderTabId = sender.tab?.id ?? null;
    state = reduceBackgroundState(state, message, senderTabId);
    return Promise.resolve({ ok: true });
  });
});
