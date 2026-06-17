// Flag the player while a handle/cursor is being dragged. Two effects:
//  - data-dragging on our root keeps the overlay visible if YouTube's idle
//    timer fires while the pointer is held still.
//  - data-you-loop-scrubbing on the player forces its chrome visible (CSS) so
//    the controls stay put while a handle/cursor/playhead is dragged. The OS
//    cursor stays visible during these drags.
// `el` is any node inside the overlay; we walk up to the shared ancestors.
export function setPlayerDragLock(el: Element | null, on: boolean): void {
  if (el == null) {
    return;
  }

  const ui = el.closest<HTMLElement>(".you-loop-page-ui");
  const player = el.closest<HTMLElement>(".html5-video-player");

  if (on) {
    if (ui != null) ui.dataset.dragging = "true";
    if (player != null) player.dataset.youLoopScrubbing = "true";
  } else {
    if (ui != null) delete ui.dataset.dragging;
    if (player != null) delete player.dataset.youLoopScrubbing;
  }
}
