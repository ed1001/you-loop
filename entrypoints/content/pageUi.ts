const PAGE_UI_SELECTOR = "[data-you-loop-page-ui]";

export function createPageUiElement() {
  const panel = document.createElement("div");
  panel.dataset.youLoopPageUi = "true";
  panel.className = "you-loop-page-ui";
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
