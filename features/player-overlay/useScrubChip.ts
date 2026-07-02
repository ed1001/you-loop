// Shared machinery for the press-and-drag chip controls (speed, pitch): a
// pill that pointer-locks on press, accumulates drag travel, and shows a
// portaled tape popover anchored above itself while the gesture is held.
// Consumers own the gesture semantics (what vertical/horizontal travel
// means); this hook owns the pointer plumbing.
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// Mirror of the popover's exit animation length; keeps it mounted long enough
// to play its sink-out.
const POP_EXIT_MS = 140;

type ScrubDragBase = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  // Drag travel in px. With pointer lock the OS cursor is frozen and
  // clientX/Y stop moving, so travel accumulates from movementX/Y instead.
  accX: number;
  accY: number;
};

export function useScrubChip<TExtra extends object>(
  container: HTMLElement | null
) {
  type Drag = ScrubDragBase & TExtra;

  const chipRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const exitTimerRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // Popover anchor, in container-local coordinates (px).
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const [pulse, setPulse] = useState(false);

  useEffect(() => () => window.clearTimeout(exitTimerRef.current), []);

  // Pin our overlay (and YouTube's bottom chrome) visible while scrubbing,
  // same flags the zoom timeline uses. The speed-scrub flag additionally
  // hides the cursor: the popover is the pointer during the gesture.
  const setDragLock = (on: boolean) => {
    const chip = chipRef.current;
    if (chip == null) return;
    const ui = chip.closest<HTMLElement>(".you-loop-page-ui");
    const player = chip.closest<HTMLElement>(".html5-video-player");
    if (on) {
      if (ui != null) ui.dataset.dragging = "true";
      if (player != null) {
        player.dataset.youLoopScrubbing = "true";
        player.dataset.youLoopSpeedScrub = "true";
      }
    } else {
      if (ui != null) delete ui.dataset.dragging;
      if (player != null) {
        delete player.dataset.youLoopScrubbing;
        delete player.dataset.youLoopSpeedScrub;
      }
    }
  };

  // The release of a scrub can land over any YouTube control (pause, settings,
  // the scrubber…); the browser then synthesizes a click there. Swallow the
  // next click, once, in the capture phase so the drag's release stays ours.
  const suppressNextClick = () => {
    const swallowOnce = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallowOnce, { capture: true, once: true });
    // If no click materializes (e.g. release outside the window), drop the
    // trap so it cannot eat an unrelated later click.
    window.setTimeout(() => {
      window.removeEventListener("click", swallowOnce, { capture: true });
    }, 250);
  };

  const updateAnchor = () => {
    const chip = chipRef.current;
    if (chip == null || container == null) return;
    const chipRect = chip.getBoundingClientRect();
    const hostRect = container.getBoundingClientRect();
    // The chip scales up while scrubbing (and pulses on a snap), inflating
    // its measured rect mid-drag. The scale pivots on the chip's center, so
    // anchor off the center and rebuild the top edge from the layout height
    // (offsetHeight ignores transforms) — the press-time and move-time
    // measurements then always agree, and the popover cannot hop.
    const left = chipRect.left + chipRect.width / 2 - hostRect.left;
    const top =
      chipRect.top +
      chipRect.height / 2 -
      chip.offsetHeight / 2 -
      hostRect.top;
    setAnchor((prev) =>
      prev.left === left && prev.top === top ? prev : { left, top }
    );
  };

  const openPopover = () => {
    window.clearTimeout(exitTimerRef.current);
    setClosing(false);
    updateAnchor();
    setOpen(true);
  };

  const closePopover = () => {
    setClosing(true);
    exitTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, POP_EXIT_MS);
  };

  /** Whether the chip currently holds the pointer lock. */
  const isLocked = () => document.pointerLockElement === chipRef.current;

  /** Pointer-down boilerplate: seed the drag record, capture the pointer,
      pin the cursor, and open the popover. */
  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    extra: TExtra
  ) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      accX: 0,
      accY: 0,
      ...extra
    } as Drag;
    // Capture before anything else: without it the release lands on whatever
    // YouTube control sits under the pointer. Throws on an already-released
    // (or synthetic) pointer — the drag still works, only uncaptured.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // keep the drag alive
    }
    // Pin the OS cursor for the scrub (input-scrubbing idiom): it reappears
    // exactly on the chip at release instead of wherever the drag wandered.
    // Best-effort — when unavailable/denied the clientX/Y fallback below
    // still drives the drag, with the cursor merely hidden by CSS.
    try {
      const lock = event.currentTarget.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      lock?.catch?.(() => {});
    } catch {
      // keep the drag alive
    }
    setDragLock(true);
    openPopover();
  };

  // Fold a pointer event into the drag's accumulated travel. Locked: the
  // cursor is frozen, so integrate movementX/Y. Unlocked: absolute deltas
  // from the press point (also the test-environment path).
  const trackTravel = (
    drag: Drag,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (isLocked()) {
      drag.accX += event.movementX ?? 0;
      drag.accY += event.movementY ?? 0;
    } else {
      drag.accX = event.clientX - drag.startX;
      drag.accY = event.clientY - drag.startY;
    }
    if (Math.abs(drag.accX) > 2 || Math.abs(drag.accY) > 2) drag.moved = true;
  };

  /** Pointer-up/cancel boilerplate: drop the drag, unpin the cursor (the
      browser restores it to the press point — the chip), close the popover. */
  const endDrag = () => {
    dragRef.current = null;
    if (isLocked()) {
      document.exitPointerLock?.();
    }
    setDragLock(false);
    closePopover();
  };

  /** Pointer-move prologue: filter to the owning pointer (a second pointer
      must not steer a drag it didn't start), swallow the event, re-measure
      the anchor (the pill animates open/closed, so a press that landed
      mid-animation has a stale anchor), and fold in the travel. Returns the
      drag record, or null when the event is not this drag's. */
  const foldMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return null;
    event.preventDefault();
    event.stopPropagation();
    updateAnchor();
    trackTravel(drag, event);
    return drag;
  };

  /** Pointer-up prologue: same filter/swallow/travel fold, without the
      anchor re-measure. */
  const foldRelease = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag == null || event.pointerId !== drag.pointerId) return null;
    event.preventDefault();
    event.stopPropagation();
    trackTravel(drag, event);
    return drag;
  };

  return {
    chipRef,
    dragRef,
    open,
    closing,
    anchor,
    pulse,
    setPulse,
    beginDrag,
    foldMove,
    foldRelease,
    endDrag,
    suppressNextClick,
    isLocked
  };
}
