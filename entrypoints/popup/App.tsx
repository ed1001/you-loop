import { useState } from "react";

type PageUiMessage = {
  type: "you-loop:set-page-ui-visible";
  visible: boolean;
};

async function sendPageUiToggle(visible: boolean) {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id == null) {
    return;
  }

  const message = {
    type: "you-loop:set-page-ui-visible",
    visible,
  } satisfies PageUiMessage;

  await browser.tabs.sendMessage(activeTab.id, message);
}

function App() {
  const [pageUiVisible, setPageUiVisible] = useState(false);
  const [status, setStatus] = useState("");

  const togglePageUi = async () => {
    const nextVisible = !pageUiVisible;
    setStatus("");

    try {
      await sendPageUiToggle(nextVisible);
      setPageUiVisible(nextVisible);
    } catch {
      setStatus("Open a YouTube page and reload the extension");
    }
  };

  return (
    <main className="you-loop-popup">
      <button
        className="you-loop-popup-button"
        type="button"
        onClick={() => void togglePageUi()}
      >
        {pageUiVisible ? "Hide page UI" : "Show page UI"}
      </button>
      {status.length > 0 && (
        <p className="you-loop-popup-status" role="status">
          {status}
        </p>
      )}
    </main>
  );
}

export default App;
