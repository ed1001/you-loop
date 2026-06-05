const PAGE_UI_SELECTOR = "[data-you-loop-page-ui]";

export function createPageUiElement() {
  const panel = document.createElement("div");
  panel.dataset.youLoopPageUi = "true";
  panel.className =
    "fixed right-4 top-20 z-[2147483647] rounded-md border border-red-200 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-xl";
  panel.textContent = "You Loop UI on";

  return panel;
}

export function setPageUiVisible(host: Element, visible: boolean) {
  const existing = host.querySelector(PAGE_UI_SELECTOR);

  if (visible && existing == null) {
    host.append(createPageUiElement());
    return;
  }

  if (!visible) {
    existing?.remove();
  }
}
