// After a pointer drag the browser fires a synthesized `click`. pointerup's
// stopPropagation does NOT stop it — it's a separate event. If pointer capture
// was lost mid-drag (release lands off our handle, e.g. on the video) that
// click hits YouTube's player and toggles play/pause or seeks.
//
// Swallowing it on our own elements isn't enough because the click can land
// anywhere. Arm a one-shot capture-phase listener on the window at drag start;
// it eats the next click before it reaches any YouTube handler, then removes
// itself. A timeout drops the listener if no click follows (cancelled drag),
// so it can never eat an unrelated later click.
export function suppressNextClick(): void {
  const cleanup = () => {
    window.removeEventListener("click", onClick, true);
  };
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };
  window.addEventListener("click", onClick, true);
  // The drag-end click fires synchronously after pointerup, before this
  // macrotask; the timeout only matters when no click arrives at all.
  setTimeout(cleanup, 0);
}
