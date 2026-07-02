// Styles for the page UI. Injected via a <style> in document.head by
// ensureDocumentStyles, because our elements mount into YouTube's light DOM
// (inside .ytp-progress-bar), where WXT's ui-scoped style.css cannot reach
// them. Kept as a string here so pageUi.tsx stays focused on behavior.

export const PAGE_UI_STYLES = `
    .you-loop-page-ui {
      inset: 0;
      overflow: visible;
      pointer-events: none;
      position: absolute;
      opacity: 1;
      transition: opacity 0.25s cubic-bezier(0, 0, 0.2, 1);
    }

    .you-loop-page-ui[data-hidden="true"] {
      opacity: 0;
    }

    /* While scrubbing the zoom timeline, stay visible even if YouTube autohides
       its controls (e.g. idle timer firing while the pointer is held still). */
    .you-loop-page-ui[data-dragging="true"] {
      opacity: 1;
    }

    /* Our overlay lives inside .ytp-chrome-bottom; if YouTube fades that parent,
       the overlay fades with it. Force it (and the bottom gradient) visible
       while scrubbing the zoom timeline. */
    .html5-video-player[data-you-loop-scrubbing="true"] .ytp-chrome-bottom,
    .html5-video-player[data-you-loop-scrubbing="true"] .ytp-gradient-bottom {
      opacity: 1 !important;
    }

    /* Hovering our panel or zoom timeline pins the overlay open, even if
       YouTube's idle timer fires while the pointer sits still. The :has()
       outranks the data-hidden rule, so the fade is suppressed. */
    .you-loop-page-ui:has(.you-loop-panel:hover),
    .you-loop-page-ui:has(.you-loop-zoom:hover),
    .you-loop-page-ui:has(.you-loop-handle:hover) {
      opacity: 1;
    }

    /* …and keep YouTube's bottom chrome (our parent) from fading out under us
       while hovering, same as the scrubbing case above. */
    .html5-video-player:has(.you-loop-panel:hover) .ytp-chrome-bottom,
    .html5-video-player:has(.you-loop-panel:hover) .ytp-gradient-bottom,
    .html5-video-player:has(.you-loop-zoom:hover) .ytp-chrome-bottom,
    .html5-video-player:has(.you-loop-zoom:hover) .ytp-gradient-bottom,
    .html5-video-player:has(.you-loop-handle:hover) .ytp-chrome-bottom,
    .html5-video-player:has(.you-loop-handle:hover) .ytp-gradient-bottom {
      opacity: 1 !important;
    }

    .you-loop-timeline {
      height: 100%;
      margin: 0;
      pointer-events: none;
      position: relative;
      width: 100%;
    }

    /* Teal band over the progress bar marking the loop segment. Visual only —
       window drag is handled by Shift+handle drag, not the band. */
    .you-loop-loop-range {
      background: rgba(20, 184, 166, 0.55);
      border-radius: 1px;
      height: 9px;
      pointer-events: none;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }

    /* Loop cursors: bracket flags. A slim stem with short arms pointing INTO
       the loop ([ for start, ] for end) so the two ends read at a glance. The
       button itself is an invisible hitbox — the bracket paints in ::before —
       because the clamped-left math in TimelineHandles depends on the 10px
       button width. */
    .you-loop-handle {
      background: transparent;
      border: 0;
      cursor: ew-resize;
      height: 26px;
      margin: 0;
      padding: 0;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      /* Only vertical centering here. Horizontal position is a clamped left
         set per-handle (see TimelineHandles) so the 10px hitbox never hangs off
         the track edge — a half-off thumb at the ends gets clipped by YouTube's
         overflow:hidden progress bar and becomes ungrabbable on Firefox. */
      transform: translateY(-50%);
      width: 10px;
      z-index: 2147483647;
    }

    .you-loop-handle::before,
    .you-loop-zoom-cursor::before {
      border: 2.5px solid #14b8a6;
      bottom: 1px;
      content: "";
      /* drop-shadow follows the bracket's painted pixels (a box-shadow would
         trace the open rectangle): white hairline for contrast on bright
         frames, then depth. */
      filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.85))
        drop-shadow(0 1px 4px rgba(0, 0, 0, 0.45));
      position: absolute;
      top: 1px;
      transition: border-color 0.15s ease, transform 0.15s ease;
      width: 7px;
      will-change: transform;
    }

    .you-loop-handle[data-edge="start"]::before,
    .you-loop-zoom-cursor[data-edge="start"]::before {
      border-radius: 4px 0 0 4px;
      border-right: 0;
      left: 1px;
    }

    .you-loop-handle[data-edge="end"]::before,
    .you-loop-zoom-cursor[data-edge="end"]::before {
      border-left: 0;
      border-radius: 0 4px 4px 0;
      right: 1px;
    }

    .you-loop-handle:hover::before,
    .you-loop-zoom-cursor:hover::before {
      border-color: #2dd4bf;
      transform: scale(1.12);
    }

    .you-loop-handle:active::before,
    .you-loop-handle[data-drag-live="true"]::before,
    .you-loop-zoom-cursor:active::before {
      border-color: #5eead4;
      filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.9))
        drop-shadow(0 0 6px rgba(20, 184, 166, 0.8))
        drop-shadow(0 1px 4px rgba(0, 0, 0, 0.45));
    }

    /* Time readout above the handle while it is dragged. Same dark-glass pill
       language as the panel. */
    .you-loop-handle-chip {
      background: rgba(15, 15, 16, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      bottom: calc(100% + 8px);
      color: #f2f1ed;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      left: 50%;
      line-height: 1;
      opacity: 0;
      padding: 4px 7px;
      pointer-events: none;
      position: absolute;
      transform: translateX(-50%) translateY(2px);
      transition: opacity 0.12s ease, transform 0.12s ease;
      white-space: nowrap;
    }

    .you-loop-handle[data-drag-live="true"] .you-loop-handle-chip,
    .you-loop-zoom-cursor[data-drag-live="true"] .you-loop-handle-chip {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* Count-in beacon: a numeral over a vertical line, rising from the loop
       start on the progress bar. Remounted per beat (keyed in React), so the
       pulse keyframes replay on every tick. */
    .you-loop-countin-beacon {
      align-items: center;
      bottom: calc(50% + 14px);
      display: flex;
      flex-direction: column;
      gap: 4px;
      pointer-events: none;
      position: absolute;
      transform: translateX(-50%);
      z-index: 2147483647;
    }

    .you-loop-countin-beacon-line {
      animation: you-loop-countin-flash 0.4s ease-out;
      background: linear-gradient(to top, #14b8a6, rgba(20, 184, 166, 0.15));
      border-radius: 1px;
      box-shadow: 0 0 6px rgba(20, 184, 166, 0.7);
      height: 18px;
      transform-origin: bottom;
      width: 2px;
    }

    /* The numeral sits in a small glass disc (same dark-pill language as the
       panel) so it stays legible over bright or busy video frames. The pop
       plays once when the beacon mounts (per count), not per beat — only the
       line pulses with the metronome. */
    .you-loop-countin-beacon-num {
      align-items: center;
      animation: you-loop-countin-pop 0.4s ease-out;
      transition:
        width 0.12s ease,
        height 0.12s ease,
        font-size 0.12s ease,
        box-shadow 0.12s ease,
        color 0.12s ease;
      backdrop-filter: blur(6px) saturate(1.3);
      background: rgba(24, 26, 29, 0.72);
      border-radius: 999px;
      box-shadow:
        inset 0 0 0 1px rgba(20, 184, 166, 0.45),
        0 2px 10px rgba(0, 0, 0, 0.45);
      color: #ffffff;
      display: flex;
      font-family: "YouTube Sans", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 700;
      height: 24px;
      justify-content: center;
      line-height: 1;
      width: 24px;
    }

    /* Downbeat: taller, brighter strike. */
    .you-loop-countin-beacon[data-accent] .you-loop-countin-beacon-line {
      background: linear-gradient(to top, #5eead4, rgba(94, 234, 212, 0.2));
      box-shadow: 0 0 10px rgba(94, 234, 212, 0.9);
      height: 26px;
    }

    .you-loop-countin-beacon[data-accent] .you-loop-countin-beacon-num {
      box-shadow:
        inset 0 0 0 1px rgba(94, 234, 212, 0.8),
        0 0 12px rgba(20, 184, 166, 0.5),
        0 2px 10px rgba(0, 0, 0, 0.45);
      color: #ccfbf1;
      font-size: 14px;
      height: 28px;
      width: 28px;
    }

    @keyframes you-loop-countin-flash {
      from {
        filter: brightness(2.2);
        transform: scaleY(0.3);
      }
      40% {
        filter: brightness(1.6);
        transform: scaleY(1.12);
      }
      to {
        filter: brightness(1);
        transform: scaleY(1);
      }
    }

    @keyframes you-loop-countin-pop {
      from {
        opacity: 0.4;
        transform: scale(1.5);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .you-loop-panel {
      align-items: center;
      background: rgba(38, 38, 42, 0.9);
      border-radius: 999px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      display: flex;
      gap: 6px;
      left: 50%;
      padding: 4px;
      pointer-events: auto;
      position: absolute;
      top: 100%;
      transform: translate(-50%, 12px);
      /* max-content stops the absolute pill's shrink-to-fit width from clamping
         to the player width on narrow players — without it the grid collapses,
         overflow:hidden clips the controls, and the icons get cut off. */
      width: max-content;
      z-index: 2147483647;
    }

    /* Middle wrapper holding the wordmark and the control cluster as two
       independently-collapsing width slots. The panel sees one flex item
       here, so the pill width is simply their sum — no min-width racing the
       content, hence no bounce as it resizes. */
    .you-loop-center {
      align-items: center;
      display: flex;
      gap: 0;
    }

    /* Empty spacer that reserves the wordmark's footprint while off and folds
       to nothing when on. Plain width animation (definite values) so the pill's
       width = spacer + cluster stays monotonic — no bounce. */
    .you-loop-wordmark-slot {
      flex: none;
      width: 0;
      transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .you-loop-panel[data-on="false"] .you-loop-wordmark-slot {
      width: 92px;
    }

    /* Brand wordmark: matches the help modal's eyebrow (teal, bold). A sibling
       of the pill anchored to the page-ui overlay — whose width never animates
       — at the pill's fixed center: top 100% + 12px panel offset + 19px (half
       the 38px pill). Inside the pill, left:50% would re-resolve against the
       animating width every frame and the rounding makes the text shimmer;
       anchored here it is computed once, perfectly still, and only fades. */
    .you-loop-wordmark {
      color: #ffffff;
      font-family: "Étude Fraunces", Georgia, serif;
      font-style: italic;
      font-size: 17px;
      font-weight: 500;
      left: 50%;
      letter-spacing: 0.01em;
      opacity: 0;
      pointer-events: none;
      position: absolute;
      top: calc(100% + 31px);
      transform: translate(-50%, -50%);
      transition: opacity 0.2s ease;
      white-space: nowrap;
      z-index: 2147483647;
    }

    /* Turning off, the wordmark may appear early (the pill is already wide
       enough for it); it just trails the controls fading out. */
    .you-loop-wordmark[data-on="false"] {
      opacity: 1;
      transition-delay: 0.06s;
    }

    /* Collapsible control cluster. The grid 1fr↔0fr trick animates the inner
       row's width, which is what drives the pill's expand/collapse. */
    .you-loop-cluster {
      display: grid;
      grid-template-columns: 1fr;
      /* Controls fade in only once the slot has finished opening (delay ≈ the
         width duration), so they never appear while the clip is still widening
         — otherwise the last buttons read as sliding in. */
      transition: grid-template-columns 0.5s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.16s ease 0.46s;
    }

    .you-loop-panel[data-on="false"] .you-loop-cluster {
      grid-template-columns: 0fr;
      opacity: 0;
      /* Collapsing: controls fade out fast and first, before the slot narrows,
         so they never look crushed. */
      transition: grid-template-columns 0.5s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.12s ease;
    }

    /* overflow + min-width:0 let the grid column collapse to zero cleanly. */
    .you-loop-cluster-inner {
      align-items: center;
      display: flex;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
    }

    /* Keep each control at its intrinsic size while the column collapses — the
       clip happens horizontally only. Without this the squeezed row rewraps and
       the pill grows taller when off. */
    .you-loop-cluster-inner > * {
      flex: none;
      white-space: nowrap;
    }

    /* Power toggle: enables/disables the loop range. Icon only. */
    .you-loop-power {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease,
        transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      width: 30px;
    }

    .you-loop-power svg {
      height: 17px;
      width: 17px;
    }

    .you-loop-power:hover {
      color: rgba(255, 255, 255, 0.85);
    }

    .you-loop-power[data-on="true"] {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    /* The two outer buttons roll outward as the cluster opens (and back as it
       closes) — left spins counter-clockwise, right clockwise, like wheels
       tracking the pill's expansion. */
    .you-loop-panel[data-on="true"] .you-loop-power {
      transform: rotate(-360deg);
    }

    .you-loop-panel[data-on="true"] .you-loop-help-toggle {
      transform: rotate(360deg);
    }

    /* Segmented mode control: a recessed well groups the two mutually
       exclusive options (loop vs one-shot). */
    .you-loop-modes {
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 2px;
      padding: 2px;
      transition: opacity 0.18s ease;
    }

    /* Dimmed and inert while the loop is off. */
    .you-loop-modes[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-mode-option:disabled,
    .you-loop-zoom-toggle:disabled {
      cursor: default;
    }

    .you-loop-mode-option {
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.62);
      cursor: pointer;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      padding: 7px 14px;
      text-transform: uppercase;
      transition: background 0.18s ease, color 0.18s ease;
    }

    .you-loop-mode-option:not(:disabled):not([data-active="true"]):hover {
      color: rgba(255, 255, 255, 0.92);
    }

    .you-loop-mode-option[data-active="true"] {
      background: #14b8a6;
      color: #0a0a0a;
    }

    /* Magnifying-glass toggle for the zoom timeline. */
    .you-loop-zoom-toggle {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease;
      width: 30px;
    }

    .you-loop-zoom-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-zoom-toggle:not(:disabled):hover {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    .you-loop-zoom-toggle[data-on="true"] {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    /* Dimmed while the loop is off, but still clickable: interacting turns it on. */
    .you-loop-zoom-toggle[data-disabled="true"] {
      opacity: 0.4;
    }

    /* Speed scrubber: a single readout chip. Press and drag up/down to scrub
       the rate (a tick tape pops up above); drag hard right and release to
       snap back to 1×. */
    .you-loop-speed {
      align-items: center;
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      padding: 2px;
      transition: opacity 0.18s ease;
    }

    .you-loop-speed[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-speed-value {
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.78);
      cursor: ns-resize;
      display: grid;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      height: 27px;
      letter-spacing: 0.01em;
      min-width: 44px;
      padding: 0 6px;
      place-items: center;
      text-align: center;
      touch-action: none;
      transition: color 0.15s ease, transform 0.15s ease;
      user-select: none;
      -webkit-user-select: none;
    }

    .you-loop-speed-value:not(:disabled):hover {
      color: #ffffff;
    }

    .you-loop-speed-value:disabled {
      cursor: default;
    }

    /* The × sits a touch larger than the number. */
    .you-loop-speed-x {
      font-size: 13px;
      margin-left: 0.5px;
    }

    .you-loop-speed-value[data-modified="true"] {
      color: #5eead4;
    }

    /* While scrubbing the chip is the live readout: lift it and go teal. */
    .you-loop-speed-value[data-scrubbing="true"] {
      color: #5eead4;
      transform: scale(1.12);
    }

    /* Snap-back pulse confirms the reset gesture landed. */
    .you-loop-speed-value[data-pulse="true"] {
      animation: you-loop-speed-pulse 0.32s ease;
    }

    @keyframes you-loop-speed-pulse {
      0% {
        transform: scale(1);
      }
      35% {
        transform: scale(1.28);
      }
      100% {
        transform: scale(1);
      }
    }

    /* ── Speed scrub popover ───────────────────────────────────────────────
       Portaled to the player (the pill clips overflow) and anchored above the
       chip. Pointer events stay captured on the chip, so the popover is a
       pure display surface. --you-loop-arm (0–1) is the reset gesture's
       progress, driven from JS on every pointer move. */
    .you-loop-speed-pop {
      --you-loop-arm: 0;
      animation: you-loop-speed-pop-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
      pointer-events: none;
      position: absolute;
      transform: translate(-50%, calc(-100% - 10px));
      z-index: 2147483647;
    }

    @keyframes you-loop-speed-pop-in {
      from {
        opacity: 0;
        transform: translate(-50%, calc(-100% - 2px)) scaleY(0.82);
      }
      to {
        opacity: 1;
        transform: translate(-50%, calc(-100% - 10px)) scaleY(1);
      }
    }

    .you-loop-speed-pop[data-closing="true"] {
      animation: you-loop-speed-pop-out 0.14s ease both;
    }

    @keyframes you-loop-speed-pop-out {
      from {
        opacity: 1;
        transform: translate(-50%, calc(-100% - 10px)) scaleY(1);
      }
      to {
        opacity: 0;
        transform: translate(-50%, calc(-100% - 4px)) scaleY(0.88);
      }
    }

    /* The tape rail: a slim vertical window of ticks behind a fixed needle.
       Dragging right eases it aside and dims it — the gesture is leaving
       scrub mode and heading for the reset target. */
    .you-loop-speed-rail {
      background: rgba(28, 28, 32, 0.92);
      -webkit-backdrop-filter: blur(12px) saturate(1.2);
      backdrop-filter: blur(12px) saturate(1.2);
      border: 1px solid rgba(0, 0, 0, 0.6);
      border-radius: 0;
      box-shadow:
        0 0 0 1px rgba(20, 184, 166, 0.18),
        0 12px 36px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      height: 148px;
      opacity: calc(1 - var(--you-loop-arm) * 0.6);
      overflow: hidden;
      position: relative;
      transform: translateX(calc(var(--you-loop-arm) * 14px));
      width: 64px;
      -webkit-mask-image: linear-gradient(
        to bottom,
        transparent,
        #000 22px,
        #000 calc(100% - 22px),
        transparent
      );
      mask-image: linear-gradient(
        to bottom,
        transparent,
        #000 22px,
        #000 calc(100% - 22px),
        transparent
      );
    }

    /* The tape glides under the needle in quantized 0.05× steps; the short
       transform tween turns each step into a click of motion. */
    .you-loop-speed-tape {
      inset: 0 0 auto 0;
      position: absolute;
      transition: transform 0.09s cubic-bezier(0.2, 0, 0.2, 1);
      will-change: transform;
    }

    .you-loop-speed-tick {
      background: rgba(255, 255, 255, 0.16);
      height: 1.5px;
      left: 10px;
      position: absolute;
      transform: translateY(-50%);
      width: 9px;
    }

    .you-loop-speed-tick[data-labeled="true"] {
      background: rgba(255, 255, 255, 0.42);
      width: 15px;
    }

    .you-loop-speed-tick[data-home="true"] {
      background: #14b8a6;
      box-shadow: 0 0 6px rgba(20, 184, 166, 0.7);
    }

    .you-loop-speed-tick-label {
      color: rgba(255, 255, 255, 0.55);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 9.5px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      left: 21px;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }

    .you-loop-speed-tick[data-home="true"] .you-loop-speed-tick-label {
      color: #5eead4;
    }

    /* Fixed needle across the rail's midline. */
    .you-loop-speed-needle {
      border-top: 2px solid #2dd4bf;
      box-shadow: 0 0 8px rgba(45, 212, 191, 0.55);
      left: 6px;
      pointer-events: none;
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
    }

    /* Live readout floats just left of the rail at needle height. Fades with
       the rightward reset drag along with the rail it annotates. */
    .you-loop-speed-needle-value {
      color: #5eead4;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      letter-spacing: 0.01em;
      opacity: calc(1 - var(--you-loop-arm) * 0.85);
      position: absolute;
      right: calc(100% + 12px);
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
      top: 50%;
      transform: translateY(-50%);
      white-space: nowrap;
    }

    /* While the speed scrub is held, the popover IS the pointer — hide the
       OS cursor everywhere in the player so the needle reads as the focus. */
    .html5-video-player[data-you-loop-speed-scrub="true"],
    .html5-video-player[data-you-loop-speed-scrub="true"] * {
      cursor: none !important;
    }


    /* Snap-back target: chevrons pointing at a 1× ring off the rail's right
       edge. It idles faint as a hint that dragging right does something,
       swells and drifts in with the rightward drag, then fills teal once
       armed — release there and the rate snaps home. */
    .you-loop-speed-reset-target {
      align-items: center;
      display: flex;
      gap: 5px;
      left: calc(100% + 6px + var(--you-loop-arm) * 10px);
      opacity: calc(0.3 + var(--you-loop-arm) * 0.7);
      position: absolute;
      top: 50%;
      transform: translateY(-50%)
        scale(calc(0.75 + var(--you-loop-arm) * 0.25));
      transform-origin: left center;
    }

    .you-loop-speed-reset-col {
      align-items: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Three chevrons marching toward the ring. Each lights up as the drag
       crosses its third of the arm distance (swipe-to-unlock idiom); at idle
       the whole row breathes sideways to suggest the motion. */
    .you-loop-speed-reset-chevrons {
      animation: you-loop-chevron-nudge 1.4s ease-in-out infinite;
      flex: none;
      height: 12px;
      width: 26px;
    }

    .you-loop-speed-pop[data-armed="true"] .you-loop-speed-reset-chevrons {
      animation: none;
    }

    @keyframes you-loop-chevron-nudge {
      0%, 100% {
        transform: translateX(0);
      }
      50% {
        transform: translateX(3px);
      }
    }

    .you-loop-speed-reset-chevrons path {
      fill: none;
      stroke: #5eead4;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 2.4;
    }

    .you-loop-speed-reset-chevrons path:nth-child(1) {
      opacity: clamp(0.35, calc(var(--you-loop-arm) * 3), 1);
    }

    .you-loop-speed-reset-chevrons path:nth-child(2) {
      opacity: clamp(0.35, calc(var(--you-loop-arm) * 3 - 1), 1);
    }

    .you-loop-speed-reset-chevrons path:nth-child(3) {
      opacity: clamp(0.35, calc(var(--you-loop-arm) * 3 - 2), 1);
    }

    .you-loop-speed-reset-ring {
      align-items: center;
      background: rgba(28, 28, 32, 0.85);
      border: 2px solid rgba(94, 234, 212, 0.65);
      border-radius: 50%;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      color: #5eead4;
      display: inline-flex;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      height: 40px;
      justify-content: center;
      transition: background 0.12s ease, color 0.12s ease,
        transform 0.12s ease, box-shadow 0.12s ease;
      width: 40px;
    }

    .you-loop-speed-pop[data-armed="true"] .you-loop-speed-reset-ring {
      background: #14b8a6;
      box-shadow: 0 4px 18px rgba(20, 184, 166, 0.6),
        0 0 22px rgba(20, 184, 166, 0.5);
      color: #06302b;
      transform: scale(1.12);
    }

    .you-loop-speed-reset-word {
      color: rgba(255, 255, 255, 0.55);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      text-transform: uppercase;
    }

    .you-loop-speed-pop[data-armed="true"] .you-loop-speed-reset-word {
      color: #5eead4;
    }

    .you-loop-pitch {
      align-items: center;
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      padding: 2px;
      transition: opacity 0.18s ease;
    }

    .you-loop-pitch[data-disabled="true"] {
      opacity: 0.4;
    }

    /* Same chip anatomy as the speed pill: grid-centered readout, teal when
       an offset is dialled in, lifted while scrubbing. Wide enough for the
       longest readout ("-12.45 st") so the value never reflows the panel. */
    .you-loop-pitch-value {
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.78);
      cursor: ns-resize;
      display: grid;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      height: 27px;
      letter-spacing: 0.01em;
      min-width: 54px;
      padding: 0 6px;
      place-items: center;
      text-align: center;
      touch-action: none;
      transition: color 0.15s ease, transform 0.15s ease;
      user-select: none;
      -webkit-user-select: none;
    }

    .you-loop-pitch-value:not(:disabled):hover {
      color: #ffffff;
    }

    .you-loop-pitch-value:disabled {
      cursor: default;
    }

    /* The unit rides smaller beside the number, like the speed pill's x. */
    .you-loop-pitch-st {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin-left: 1.5px;
      opacity: 0.7;
    }

    .you-loop-pitch-value[data-modified="true"] {
      color: #5eead4;
    }

    .you-loop-pitch-value[data-scrubbing="true"] {
      color: #5eead4;
      transform: scale(1.12);
    }

    .you-loop-pitch-value[data-pulse="true"] {
      animation: you-loop-speed-pulse 0.32s ease;
    }

    /* ── Pitch scrub popover ───────────────────────────────────────────────
       Shares the speed scrubber's rail/tape/needle/reset-target styles (the
       .you-loop-speed-pop classes); below are only the pitch-specific parts.
       --you-loop-fine (0-1) is the leftward fine-gear reveal. */
    .you-loop-pitch-pop {
      --you-loop-fine: 0;
    }

    /* Both of the pitch pop's flanks are occupied (fine target left, reset
       target right), so the live readout floats above the rail instead of
       beside it. */
    .you-loop-pitch-pop .you-loop-speed-needle-value {
      bottom: calc(100% + 8px);
      left: 50%;
      right: auto;
      top: auto;
      transform: translateX(-50%);
    }

    /* Cents gear: the rail re-tints from teal to amber — a different scale is
       under the needle now. */
    .you-loop-pitch-pop[data-fine="true"] .you-loop-speed-rail {
      box-shadow:
        0 0 0 1px rgba(245, 158, 11, 0.28),
        0 12px 36px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .you-loop-pitch-pop[data-fine="true"] .you-loop-speed-needle {
      border-top-color: #fbbf24;
      box-shadow: 0 0 8px rgba(251, 191, 36, 0.55);
    }

    .you-loop-pitch-pop[data-fine="true"] .you-loop-speed-tick[data-home="true"] {
      background: #f59e0b;
      box-shadow: 0 0 6px rgba(245, 158, 11, 0.7);
    }

    .you-loop-pitch-pop[data-fine="true"]
      .you-loop-speed-tick[data-home="true"]
      .you-loop-speed-tick-label {
      color: #fbbf24;
    }

    .you-loop-pitch-pop[data-fine="true"] .you-loop-speed-needle-value {
      color: #fbbf24;
    }

    /* While in cents gear the reset target sits out; release and re-drag. */
    .you-loop-pitch-pop[data-fine="true"] .you-loop-speed-reset-target {
      opacity: 0.1;
    }

    /* Fine-gear target: the reset target's mirror on the left edge. Idles
       faint, drifts in and swells with the leftward pull, then glows amber
       once the gear latches. */
    .you-loop-pitch-fine-target {
      align-items: center;
      display: flex;
      gap: 5px;
      opacity: calc(0.3 + var(--you-loop-fine) * 0.7);
      position: absolute;
      right: calc(100% + 6px + var(--you-loop-fine) * 10px);
      top: 50%;
      transform: translateY(-50%)
        scale(calc(0.75 + var(--you-loop-fine) * 0.25));
      transform-origin: right center;
    }

    .you-loop-pitch-pop[data-fine="true"] .you-loop-pitch-fine-target {
      opacity: 1;
    }

    .you-loop-pitch-fine-col {
      align-items: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .you-loop-pitch-fine-chevrons {
      animation: you-loop-chevron-nudge-left 1.4s ease-in-out infinite;
      flex: none;
      height: 12px;
      width: 26px;
    }

    .you-loop-pitch-pop[data-fine="true"] .you-loop-pitch-fine-chevrons {
      animation: none;
    }

    @keyframes you-loop-chevron-nudge-left {
      0%, 100% {
        transform: translateX(0);
      }
      50% {
        transform: translateX(-3px);
      }
    }

    .you-loop-pitch-fine-chevrons path {
      fill: none;
      stroke: #fbbf24;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 2.4;
    }

    .you-loop-pitch-fine-chevrons path:nth-child(1) {
      opacity: clamp(0.35, calc(var(--you-loop-fine) * 3), 1);
    }

    .you-loop-pitch-fine-chevrons path:nth-child(2) {
      opacity: clamp(0.35, calc(var(--you-loop-fine) * 3 - 1), 1);
    }

    .you-loop-pitch-fine-chevrons path:nth-child(3) {
      opacity: clamp(0.35, calc(var(--you-loop-fine) * 3 - 2), 1);
    }

    .you-loop-pitch-fine-ring {
      align-items: center;
      background: rgba(28, 28, 32, 0.85);
      border: 2px solid rgba(251, 191, 36, 0.55);
      border-radius: 50%;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      color: #fbbf24;
      display: inline-flex;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 15px;
      font-weight: 700;
      height: 40px;
      justify-content: center;
      transition: background 0.12s ease, color 0.12s ease,
        transform 0.12s ease, box-shadow 0.12s ease;
      width: 40px;
    }

    .you-loop-pitch-pop[data-fine="true"] .you-loop-pitch-fine-ring {
      background: #f59e0b;
      box-shadow: 0 4px 18px rgba(245, 158, 11, 0.6),
        0 0 22px rgba(245, 158, 11, 0.5);
      color: #451a03;
      transform: scale(1.12);
    }

    .you-loop-pitch-fine-word {
      color: rgba(255, 255, 255, 0.55);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      text-transform: uppercase;
    }

    .you-loop-pitch-pop[data-fine="true"] .you-loop-pitch-fine-word {
      color: #fbbf24;
    }

    /* Full-width timeline floating above the native scrubber, mapping just the
       loop range across its whole width. */
    .you-loop-zoom {
      align-items: center;
      animation: you-loop-zoom-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      bottom: 100%;
      display: flex;
      gap: 10px;
      left: 0;
      margin-bottom: 30px;
      pointer-events: none;
      position: absolute;
      transform-origin: center bottom;
      width: 100%;
    }

    @keyframes you-loop-zoom-in {
      from {
        opacity: 0;
        transform: translateY(8px) scaleY(0.55);
      }
      to {
        opacity: 1;
        transform: translateY(0) scaleY(1);
      }
    }

    /* Reverse of the entrance, played while the strip unmounts. */
    .you-loop-zoom[data-closing="true"] {
      animation: you-loop-zoom-out 0.22s cubic-bezier(0.7, 0, 0.84, 0) forwards;
      pointer-events: none;
    }

    @keyframes you-loop-zoom-out {
      from {
        opacity: 1;
        transform: translateY(0) scaleY(1);
      }
      to {
        opacity: 0;
        transform: translateY(8px) scaleY(0.55);
      }
    }

    /* Magnifying-glass badge marking this strip as the zoomed timeline. */
    .you-loop-zoom-badge {
      align-items: center;
      background: radial-gradient(
        circle at 50% 50%,
        rgba(20, 184, 166, 0.28),
        rgba(20, 184, 166, 0.08)
      );
      border: 1px solid rgba(94, 234, 212, 0.45);
      border-radius: 50%;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45),
        0 0 14px rgba(20, 184, 166, 0.35);
      color: #5eead4;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      width: 30px;
    }

    .you-loop-zoom-badge svg {
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
      height: 22px;
      width: 22px;
    }

    .you-loop-zoom-time {
      color: #5eead4;
      flex: none;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    }

    .you-loop-zoom-track {
      background: linear-gradient(
        180deg,
        rgba(20, 184, 166, 0.16),
        rgba(20, 184, 166, 0.3)
      );
      border: 1px solid rgba(94, 234, 212, 0.45);
      border-radius: 3px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5),
        inset 0 0 0 1px rgba(0, 0, 0, 0.25);
      cursor: ew-resize;
      flex: 1;
      height: 10px;
      pointer-events: auto;
      position: relative;
      touch-action: none;
    }

    /* Faint tick hatch for a sense of magnified scale. */
    .you-loop-zoom-track::before {
      background-image: repeating-linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.1) 0 1px,
        transparent 1px 24px
      );
      content: "";
      inset: 0;
      position: absolute;
    }

    /* A filled teal knob, like YouTube's scrubber dot. */
    /* Playhead: an ivory needle, deliberately NOT teal — teal is the loop's
       structural color (brackets, band). A neutral needle stays legible when it
       passes through a bracket instead of melting into it. */
    .you-loop-zoom-playhead {
      background: #f2f1ed;
      border-radius: 2px;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 0 6px rgba(0, 0, 0, 0.35);
      height: 22px;
      left: 0;
      pointer-events: none;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      transition: opacity 0.15s ease;
      width: 3px;
      will-change: left;
      /* Sit behind the loop cursors so the needle never obscures a bracket. */
      z-index: 1;
    }

    /* Highlighted loop region between the two zoom cursors. */
    .you-loop-zoom-fill {
      background: linear-gradient(
        180deg,
        rgba(94, 234, 212, 0.45),
        rgba(20, 184, 166, 0.6)
      );
      border-radius: 2px;
      box-shadow: inset 0 0 0 1px rgba(94, 234, 212, 0.55);
      height: 100%;
      pointer-events: none;
      position: absolute;
      top: 0;
      will-change: left, width;
    }

    /* Loop refine cursors: same bracket-flag language as the main handles
       (bracket painted by the shared ::before rules above), same size too. */
    .you-loop-zoom-cursor {
      background: transparent;
      border: 0;
      cursor: ew-resize;
      height: 26px;
      margin: 0;
      padding: 0;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      transform: translate(-50%, -50%);
      width: 10px;
      will-change: left;
      z-index: 2;
    }

    /* While hovering the zoom track, suppress YouTube's "most replayed" heatmap
       so it does not pop up and obscure the zoom timeline. */
    .html5-video-player:has(.you-loop-zoom-track:hover) .ytp-heat-map-container,
    .html5-video-player:has(.you-loop-zoom-track:hover) .ytp-heat-map-edu {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* In fullscreen, YouTube's "more videos" grid toggle sits bottom-center —
       the exact spot as our panel — and paints over it. Suppress it while our
       overlay is mounted; it returns if the extension UI is gone. */
    .html5-video-player:has(.you-loop-panel) .ytp-fullscreen-grid-buttons-container {
      display: none !important;
    }

    /* ---- Help: info toggle + docs modal ---- */
    .you-loop-help-toggle {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease,
        transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      width: 30px;
    }

    .you-loop-help-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-help-toggle:hover {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    .you-loop-help-backdrop {
      align-items: center;
      animation: you-loop-help-fade 0.18s ease both;
      background: rgba(0, 0, 0, 0.5);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 24px;
      pointer-events: auto;
      position: absolute;
      z-index: 2147483647;
    }

    @keyframes you-loop-help-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .you-loop-help-backdrop[data-closing="true"] {
      animation: you-loop-help-fade-out 0.18s ease both;
    }

    @keyframes you-loop-help-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .you-loop-help-card {
      animation: you-loop-help-rise 0.24s cubic-bezier(0.16, 1, 0.3, 1) both;
      background: rgba(28, 28, 32, 0.82);
      -webkit-backdrop-filter: blur(18px) saturate(1.2);
      backdrop-filter: blur(18px) saturate(1.2);
      border: 1px solid rgba(0, 0, 0, 0.6);
      border-radius: 16px;
      box-shadow:
        0 0 0 1px rgba(20, 184, 166, 0.16),
        0 24px 70px rgba(0, 0, 0, 0.6),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      box-sizing: border-box;
      color: rgba(255, 255, 255, 0.78);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      max-height: calc(100% - 48px);
      max-width: 660px;
      overflow-y: auto;
      padding: 26px 28px 22px;
      position: relative;
      width: 100%;
    }

    @keyframes you-loop-help-rise {
      from { opacity: 0; transform: translateY(10px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .you-loop-help-card[data-closing="true"] {
      animation: you-loop-help-sink 0.2s cubic-bezier(0.4, 0, 1, 1) both;
    }

    @keyframes you-loop-help-sink {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(8px) scale(0.97); }
    }

    .you-loop-help-close {
      align-items: center;
      background: rgba(255, 255, 255, 0.06);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      padding: 0;
      position: absolute;
      right: 16px;
      top: 16px;
      transition: color 0.18s ease, background 0.18s ease;
      width: 28px;
    }

    .you-loop-help-close svg {
      height: 15px;
      width: 15px;
    }

    .you-loop-help-close:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    /* The wordmark is the header hero. */
    .you-loop-help-eyebrow {
      color: #ffffff;
      font-family: "Étude Fraunces", Georgia, serif;
      font-style: italic;
      font-size: 24px;
      font-weight: 500;
      letter-spacing: 0.01em;
    }

    /* Teal acute accent on the wordmark's é: a second é stacked on the white
       one, clipped to just the accent — same trick as the website header. */
    .you-loop-eacute {
      display: inline-block;
      position: relative;
    }

    .you-loop-eacute-acc {
      clip-path: inset(0 0 62% 0);
      color: #5eead4;
      inset: 0;
      pointer-events: none;
      position: absolute;
    }

    /* Tagline sits beneath the wordmark as a lighter supporting line. */
    .you-loop-help-title {
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
      margin: 6px 36px 0 0;
    }

    .you-loop-help-intro {
      color: rgba(255, 255, 255, 0.62);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 8px 0 0;
    }

    .you-loop-help-section {
      margin-top: 20px;
    }

    .you-loop-help-label {
      color: #14b8a6;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.16em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }

    .you-loop-help-note {
      color: rgba(255, 255, 255, 0.4);
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: none;
    }

    .you-loop-help-list {
      /* Two columns when the card is wide enough; collapses to one on narrow
         players. Keeps the card from growing tall as controls are added. */
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(248px, 1fr));
      gap: 11px 26px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .you-loop-help-row {
      align-items: start;
      display: grid;
      gap: 6px 14px;
      grid-template-columns: 96px 1fr;
    }

    /* Panel rows lead with the control's own glyph in a narrow column. */
    .you-loop-help-row--panel {
      align-items: start;
      grid-template-columns: 30px 1fr;
    }

    .you-loop-help-ico {
      align-items: center;
      color: #5eead4;
      display: inline-flex;
      height: 17px;
      justify-content: center;
    }

    .you-loop-help-ico svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-help-ico-pair {
      align-items: center;
      color: #5eead4;
      display: inline-flex;
      gap: 1px;
    }

    .you-loop-help-ico-pair svg {
      height: 12px;
      width: 12px;
    }

    .you-loop-help-term {
      color: rgba(255, 255, 255, 0.92);
      font-size: 12.5px;
      font-weight: 600;
    }

    .you-loop-help-desc {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12.5px;
      line-height: 1.45;
    }

    .you-loop-help-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .you-loop-help-keys {
      align-items: center;
      display: flex;
      gap: 7px;
    }

    .you-loop-kbd {
      background: rgba(0, 0, 0, 0.34);
      border-radius: 6px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      color: #5eead4;
      display: inline-flex;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      justify-content: center;
      min-width: 24px;
      padding: 4px 7px;
    }

    .you-loop-help-hold {
      color: rgba(255, 255, 255, 0.4);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .you-loop-help-foot {
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.38);
      font-size: 11px;
      margin: 20px 0 0;
      padding-top: 12px;
    }

    .you-loop-loops-toggle {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      position: relative;
      transition: color 0.18s ease, background 0.18s ease;
      width: 30px;
    }

    .you-loop-loops-toggle svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-loops-toggle:not(:disabled):hover {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    .you-loop-loops-toggle:disabled {
      cursor: default;
      opacity: 0.4;
    }

    /* Shared base for the modal's text inputs. */
    .you-loop-loops-input {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      box-sizing: border-box;
      color: #fff;
      font-size: 12.5px;
      min-width: 0;
      padding: 6px 8px;
    }

    .you-loop-loops-input:focus {
      border-color: rgba(94, 234, 212, 0.6);
      outline: none;
    }

    /* ── Saved-loops modal ─────────────────────────────────────────────── */
    .you-loop-lm-backdrop {
      align-items: center;
      animation: you-loop-help-fade 0.18s ease both;
      background: rgba(0, 0, 0, 0.5);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 24px;
      pointer-events: auto;
      position: absolute;
      z-index: 2147483647;
    }

    .you-loop-lm-card {
      animation: you-loop-help-rise 0.24s cubic-bezier(0.16, 1, 0.3, 1) both;
      background: rgba(28, 28, 32, 0.86);
      -webkit-backdrop-filter: blur(18px) saturate(1.2);
      backdrop-filter: blur(18px) saturate(1.2);
      border: 1px solid rgba(0, 0, 0, 0.6);
      border-radius: 16px;
      box-shadow:
        0 0 0 1px rgba(20, 184, 166, 0.16),
        0 24px 70px rgba(0, 0, 0, 0.6),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      box-sizing: border-box;
      color: rgba(255, 255, 255, 0.82);
      display: flex;
      flex-direction: column;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      gap: 18px;
      max-height: calc(100% - 48px);
      max-width: 420px;
      overflow-y: auto;
      padding: 24px 26px 22px;
      position: relative;
      width: 100%;
    }

    .you-loop-lm-close {
      align-items: center;
      background: rgba(255, 255, 255, 0.06);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      padding: 0;
      position: absolute;
      right: 16px;
      top: 16px;
      transition: color 0.18s ease, background 0.18s ease;
      width: 28px;
    }

    .you-loop-lm-close svg {
      height: 15px;
      width: 15px;
    }

    .you-loop-lm-close:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    .you-loop-lm-head {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .you-loop-lm-title {
      color: #fff;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.01em;
      margin: 0;
    }

    .you-loop-lm-sub {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      margin: 0;
    }

    .you-loop-lm-label {
      color: rgba(255, 255, 255, 0.42);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }

    .you-loop-lm-save {
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px 14px 14px;
    }

    .you-loop-lm-name {
      width: 100%;
    }

    .you-loop-lm-savebtn {
      background: #5eead4;
      border: 0;
      border-radius: 8px;
      color: #06302b;
      cursor: pointer;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 700;
      margin-top: 12px;
      padding: 8px 14px;
      transition: background 0.15s ease;
      width: 100%;
    }

    .you-loop-lm-savebtn:not(:disabled):hover {
      background: #7af0de;
    }

    .you-loop-lm-savebtn:disabled {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.4);
      cursor: default;
    }

    .you-loop-lm-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      list-style: none;
      margin: 0;
      max-height: 220px;
      overflow-y: auto;
      padding: 0;
    }

    /* Fade whichever edge has clipped rows beyond it so the partial rows signal
       there's more to scroll. Toggled from JS (the modal measures scroll
       position); a mask keeps it working over the translucent card without
       painting an opaque overlay. Each edge combination needs its own gradient. */
    .you-loop-lm-list[data-fade-bottom="true"] {
      -webkit-mask-image: linear-gradient(
        to bottom,
        #000 calc(100% - 28px),
        transparent
      );
      mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent);
    }

    .you-loop-lm-list[data-fade-top="true"] {
      -webkit-mask-image: linear-gradient(to bottom, transparent, #000 28px);
      mask-image: linear-gradient(to bottom, transparent, #000 28px);
    }

    .you-loop-lm-list[data-fade-top="true"][data-fade-bottom="true"] {
      -webkit-mask-image: linear-gradient(
        to bottom,
        transparent,
        #000 28px,
        #000 calc(100% - 28px),
        transparent
      );
      mask-image: linear-gradient(
        to bottom,
        transparent,
        #000 28px,
        #000 calc(100% - 28px),
        transparent
      );
    }

    .you-loop-lm-row {
      align-items: center;
      /* Subtle outline on every saved loop; the selected one turns teal. */
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      display: flex;
      gap: 6px;
      padding: 3px 6px 3px 4px;
      position: relative;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }

    .you-loop-lm-row:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.18);
    }

    /* Origin ring goes first: when a row is both the drift source and mid
       confirm, the selected/pending rule below (same specificity, later in
       source order, and setting both border-color and border-style) wins
       and shows the active solid-teal state instead of the dashed ring. */
    .you-loop-lm-row[data-origin="true"] {
      border-color: rgba(94, 234, 212, 0.45);
      border-style: dashed;
    }

    .you-loop-lm-row[data-selected="true"],
    .you-loop-lm-row[data-pending="true"] {
      background: rgba(94, 234, 212, 0.08);
      border-color: #5eead4;
      border-style: solid;
    }

    .you-loop-lm-apply {
      align-items: center;
      background: transparent;
      border: 0;
      color: #fff;
      cursor: pointer;
      display: flex;
      flex: 1;
      gap: 12px;
      justify-content: space-between;
      min-width: 0;
      padding: 6px 4px;
      text-align: left;
    }

    .you-loop-lm-name-text {
      align-items: center;
      display: flex;
      font-size: 13px;
      font-weight: 600;
      gap: 7px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .you-loop-lm-range {
      color: rgba(255, 255, 255, 0.45);
      flex: none;
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
    }

    /* Tempo snapshot badge; only rendered for loops carrying a count-in. */
    .you-loop-lm-tempo {
      color: rgba(94, 234, 212, 0.8);
      flex: none;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .you-loop-lm-actions {
      display: inline-flex;
      gap: 2px;
    }

    /* Hidden until the row is hovered or a child has focus, so the list reads
       clean until the user is actually interacting with a row. */
    .you-loop-lm-actions button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      opacity: 0;
      padding: 5px 6px;
      transition: opacity 0.12s ease;
    }

    .you-loop-lm-row:hover .you-loop-lm-actions button,
    .you-loop-lm-row:focus-within .you-loop-lm-actions button {
      opacity: 1;
    }

    /* Delete is destructive: hover shifts to red so it never reads as just
       another neutral action. Scoped to the delete button only — the ↻
       update button gets its own (teal) hover below. */
    .you-loop-lm-delete:hover {
      background: rgba(248, 113, 113, 0.14);
      color: #f87171;
    }

    /* Update is non-destructive: hover shifts to teal, matching the rest of
       the panel's affirmative-action language. */
    .you-loop-lm-update:hover {
      background: rgba(94, 234, 212, 0.14);
      color: #5eead4;
    }

    /* Inline confirm strip: replaces a row's apply/actions content while its
       ↻ is pending. Matches the apply button's padding so the row's height
       doesn't shift. */
    .you-loop-lm-confirm {
      align-items: center;
      display: flex;
      flex: 1;
      gap: 12px;
      justify-content: space-between;
      min-width: 0;
      padding: 6px 4px;
    }

    /* Name + delta share a single row now (was name atop delta, which made
       the strip two lines tall — taller than a normal row). */
    .you-loop-lm-confirm-info {
      align-items: baseline;
      display: flex;
      gap: 8px;
      min-width: 0;
    }

    .you-loop-lm-confirm-name {
      color: #fff;
      flex: none;
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Trails the name on the same line, truncating independently so a long
       delta never wraps the row onto a second line (which would grow the
       row taller than its neighbors). */
    .you-loop-lm-confirm-delta {
      color: rgba(255, 255, 255, 0.65);
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Always visible — unlike .you-loop-lm-actions, these are not
       hover-gated: the strip only appears on demand, so its own actions must
       already be reachable. */
    .you-loop-lm-confirm-actions {
      display: inline-flex;
      flex: none;
      gap: 2px;
    }

    .you-loop-lm-confirm-actions button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 5px 6px;
      transition: background 0.12s ease, color 0.12s ease;
    }

    .you-loop-lm-confirm-yes {
      color: #5eead4;
    }

    .you-loop-lm-confirm-yes:hover {
      background: rgba(94, 234, 212, 0.14);
    }

    /* Neutral hover: unlike delete, cancelling an update is never destructive. */
    .you-loop-lm-confirm-cancel:hover {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
    }

    /* Hairline loop-map strip along the row's bottom edge: a quick visual of
       where this loop sits within the whole video. */
    .you-loop-lm-map {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 1px;
      bottom: 0;
      height: 2px;
      left: 6px;
      overflow: hidden;
      position: absolute;
      right: 6px;
    }

    .you-loop-lm-map-band {
      background: #14b8a6;
      height: 100%;
      position: absolute;
      top: 0;
    }

    .you-loop-lm-row[data-selected="true"] .you-loop-lm-map-band {
      background: #5eead4;
    }

    /* Reuse the help modal's exit keyframes for the close animation. */
    .you-loop-lm-backdrop[data-closing="true"] {
      animation: you-loop-help-fade-out 0.18s ease both;
    }

    .you-loop-lm-card[data-closing="true"] {
      animation: you-loop-help-sink 0.2s cubic-bezier(0.4, 0, 1, 1) both;
    }

    /* ── Shared chrome polish ──────────────────────────────────────────── */

    /* Keyboard focus: a teal ring on anything focusable in our UI. Mouse
       clicks don't show it (focus-visible), so pointer use stays clean. */
    .you-loop-page-ui button:focus-visible,
    .you-loop-help-backdrop button:focus-visible,
    .you-loop-lm-backdrop button:focus-visible,
    .you-loop-lm-backdrop input:focus-visible {
      outline: 2px solid rgba(94, 234, 212, 0.85);
      outline-offset: 2px;
    }

    /* Slim, recessed scrollbars inside the modals — the default chrome bar
       reads as a foreign element on the dark glass. */
    .you-loop-lm-list::-webkit-scrollbar,
    .you-loop-lm-vlist::-webkit-scrollbar,
    .you-loop-lm-card::-webkit-scrollbar,
    .you-loop-help-card::-webkit-scrollbar {
      width: 6px;
    }

    .you-loop-lm-list::-webkit-scrollbar-thumb,
    .you-loop-lm-vlist::-webkit-scrollbar-thumb,
    .you-loop-lm-card::-webkit-scrollbar-thumb,
    .you-loop-help-card::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.16);
      border-radius: 999px;
    }

    .you-loop-lm-list::-webkit-scrollbar-thumb:hover,
    .you-loop-lm-vlist::-webkit-scrollbar-thumb:hover,
    .you-loop-lm-card::-webkit-scrollbar-thumb:hover,
    .you-loop-help-card::-webkit-scrollbar-thumb:hover {
      background: rgba(94, 234, 212, 0.4);
    }

    /* Respect reduced-motion: collapse every entrance/exit/tween to instant.
       The !important also overrides the JS-driven card height transition. */
    @media (prefers-reduced-motion: reduce) {
      .you-loop-page-ui *,
      .you-loop-speed-pop,
      .you-loop-speed-pop *,
      .you-loop-help-backdrop,
      .you-loop-help-backdrop *,
      .you-loop-lm-backdrop,
      .you-loop-lm-backdrop * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* Compact mode toggle: a single icon button replacing the segmented
       Loop/One-shot control on narrow players. Hidden in the full form. */
    .you-loop-mode-compact {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: none;
      flex: none;
      height: 26px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease;
      width: 26px;
    }

    .you-loop-mode-compact svg {
      height: 16px;
      width: 16px;
    }

    .you-loop-mode-compact:not(:disabled):hover {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    .you-loop-mode-compact[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-mode-compact:disabled {
      cursor: default;
    }

    /* ── Compact form ──────────────────────────────────────────────────────
       Active when the player is narrow (data-compact set by
       watchPlayerWidth). Shrinks the round controls, tightens the pill, swaps
       the segmented mode control for the icon button, and drops the wordmark
       so the off-state pill is just power + help. */
    .you-loop-page-ui[data-compact="true"] .you-loop-panel {
      gap: 4px;
      padding: 3px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-power,
    .you-loop-page-ui[data-compact="true"] .you-loop-zoom-toggle,
    .you-loop-page-ui[data-compact="true"] .you-loop-loops-toggle,
    .you-loop-page-ui[data-compact="true"] .you-loop-help-toggle {
      height: 26px;
      width: 26px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-power svg {
      height: 15px;
      width: 15px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-zoom-toggle svg,
    .you-loop-page-ui[data-compact="true"] .you-loop-loops-toggle svg,
    .you-loop-page-ui[data-compact="true"] .you-loop-help-toggle svg {
      height: 14px;
      width: 14px;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-modes {
      display: none;
    }

    .you-loop-page-ui[data-compact="true"] .you-loop-mode-compact {
      display: inline-flex;
    }

    .you-loop-countin { display: inline-flex; align-items: center; }
    /* Match the zoom/loops/help pill buttons: 30px circle, resting tint, teal
       when active. */
    .you-loop-countin-toggle {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 30px;
      justify-content: center;
      padding: 0;
      transition: color 0.18s ease, background 0.18s ease;
      width: 30px;
    }
    .you-loop-countin-toggle svg { height: 16px; width: 16px; }
    .you-loop-countin-toggle:not(:disabled):hover {
      background: rgba(20, 184, 166, 0.18); color: #14b8a6;
    }
    .you-loop-countin-toggle[data-on="true"] {
      background: rgba(20, 184, 166, 0.18); color: #14b8a6;
    }
    .you-loop-countin-toggle:disabled { opacity: 0.4; cursor: default; }
    /* House card recipe (help card, saved-loops modal): charcoal glass, dark
       border, whisper-teal ring, inset top highlight. */
    .you-loop-countin-pop {
      position: absolute; transform: translate(-50%, -100%) translateY(-12px);
      width: 300px; padding: 14px; border-radius: 16px;
      background: rgba(28, 28, 32, 0.92);
      -webkit-backdrop-filter: blur(18px) saturate(1.2);
      backdrop-filter: blur(18px) saturate(1.2);
      border: 1px solid rgba(0, 0, 0, 0.6);
      box-shadow:
        0 0 0 1px rgba(20, 184, 166, 0.18),
        0 12px 40px rgba(0, 0, 0, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      z-index: 2147483647;
      animation: you-loop-countin-pop-in 0.16s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: center bottom;
    }
    @keyframes you-loop-countin-pop-in {
      from { opacity: 0; transform: translate(-50%, -100%) translateY(-8px); }
      to { opacity: 1; transform: translate(-50%, -100%) translateY(-12px); }
    }
    /* Exit mirrors the entrance: settle back toward the pill and fade.
       Duration must stay in sync with POP_EXIT_MS in CountInControl. */
    .you-loop-countin-pop[data-closing="true"] {
      animation: you-loop-countin-pop-out 0.14s ease forwards;
      pointer-events: none;
    }
    @keyframes you-loop-countin-pop-out {
      from { opacity: 1; transform: translate(-50%, -100%) translateY(-12px); }
      to { opacity: 0; transform: translate(-50%, -100%) translateY(-8px); }
    }
    .you-loop-countin-head {
      display: flex; align-items: center; justify-content: space-between;
    }
    .you-loop-countin-headname {
      color: #ffffff; font-size: 13px; font-weight: 600; letter-spacing: 0.02em;
    }
    .you-loop-countin-switch {
      position: relative; width: 38px; height: 22px; padding: 0; cursor: pointer;
      /* border-box so the 16px thumb's translateX(16px) lands symmetric (2px
         inset each side) regardless of the page's default sizing. */
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 999px;
      background: rgba(255, 255, 255, 0.1); transition: background 0.15s ease, border-color 0.15s ease;
    }
    .you-loop-countin-switch::after {
      content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
      border-radius: 50%; background: rgba(255, 255, 255, 0.7); transition: transform 0.15s ease, background 0.15s ease;
    }
    .you-loop-countin-switch[data-on="true"] {
      background: #14b8a6; border-color: #5eead4;
    }
    .you-loop-countin-switch[data-on="true"]::after {
      transform: translateX(16px); background: #06302b;
    }
    .you-loop-countin-hint {
      margin: 8px 0 12px; color: rgba(255, 255, 255, 0.5); font-size: 11px; line-height: 1.45;
    }
    .you-loop-countin-label {
      display: block; margin-top: 12px; margin-bottom: 6px;
      color: #14b8a6; font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .you-loop-countin-tempo { display: flex; gap: 10px; margin: 6px 0 4px; }
    /* Tap pad — a physical strike surface. */
    .you-loop-countin-tap {
      position: relative; flex: 1; height: 132px; border-radius: 0; overflow: hidden;
      cursor: pointer; user-select: none; isolation: isolate;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      color: #5eead4; border: 1px solid rgba(94, 234, 212, 0.22);
      background:
        radial-gradient(120% 90% at 50% 18%, rgba(94, 234, 212, 0.12), transparent 60%),
        #0a0f0e;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -22px 40px rgba(0, 0, 0, 0.45);
      transition: box-shadow 0.12s ease, border-color 0.12s ease, transform 0.07s ease;
    }
    .you-loop-countin-tap::before {
      content: ""; position: absolute; inset: 0; z-index: 0; opacity: 0.5; pointer-events: none;
      background-image: radial-gradient(rgba(94, 234, 212, 0.1) 1px, transparent 1.4px);
      background-size: 13px 13px;
      -webkit-mask-image: radial-gradient(80% 80% at 50% 45%, #000, transparent 78%);
      mask-image: radial-gradient(80% 80% at 50% 45%, #000, transparent 78%);
    }
    .you-loop-countin-tap[data-flash="true"] {
      transform: translateY(1px); border-color: rgba(94, 234, 212, 0.65);
      box-shadow: inset 0 0 0 1px rgba(94, 234, 212, 0.3), 0 0 26px rgba(94, 234, 212, 0.28),
                  inset 0 -22px 40px rgba(0, 0, 0, 0.45);
    }
    .you-loop-countin-tap-read {
      position: relative; z-index: 2; display: flex; align-items: baseline; gap: 5px; line-height: 1;
      font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums;
      text-shadow: 0 0 18px rgba(94, 234, 212, 0.45);
    }
    .you-loop-countin-tap-unit { font-size: 10px; letter-spacing: 0.14em; color: #7dd3c8; opacity: 0.75; }
    .you-loop-countin-tap-hint {
      position: relative; z-index: 2; font-size: 10px; letter-spacing: 0.18em;
      text-transform: uppercase; color: #6fb6ab; opacity: 0.8;
    }
    .you-loop-countin-ripple {
      position: absolute; z-index: 1; width: 14px; height: 14px; margin: -7px 0 0 -7px;
      border-radius: 50%; border: 1.5px solid rgba(94, 234, 212, 0.7); pointer-events: none;
      animation: you-loop-countin-ripple 0.5s ease-out forwards;
    }
    @keyframes you-loop-countin-ripple {
      from { transform: scale(0.4); opacity: 0.85; }
      to { transform: scale(7); opacity: 0; }
    }
    /* BPM rail — tick tape under a fixed needle, drag to scrub (square edges). */
    .you-loop-countin-rail {
      position: relative; width: 58px; height: 132px; flex: none; overflow: hidden;
      cursor: ns-resize; touch-action: none; border-radius: 0;
      background: rgba(28, 28, 32, 0.92); border: 1px solid rgba(0, 0, 0, 0.6);
      -webkit-backdrop-filter: blur(12px) saturate(1.2);
      backdrop-filter: blur(12px) saturate(1.2);
      box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      -webkit-mask-image: linear-gradient(to bottom, transparent, #000 20px, #000 calc(100% - 20px), transparent);
      mask-image: linear-gradient(to bottom, transparent, #000 20px, #000 calc(100% - 20px), transparent);
    }
    .you-loop-countin-tape {
      position: absolute; inset: 0 0 auto 0;
      transition: transform 0.09s cubic-bezier(0.2, 0, 0.2, 1); will-change: transform;
    }
    .you-loop-countin-tick {
      position: absolute; left: 9px; width: 8px; height: 1.5px; transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.16);
    }
    .you-loop-countin-tick[data-labeled="true"] { width: 13px; background: rgba(255, 255, 255, 0.42); }
    .you-loop-countin-tick-label {
      position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 9.5px; font-weight: 600; font-variant-numeric: tabular-nums;
      color: rgba(255, 255, 255, 0.55);
    }
    .you-loop-countin-needle {
      position: absolute; left: 0; right: 0; top: 50%; height: 0;
      border-top: 2px solid #2dd4bf; box-shadow: 0 0 8px rgba(45, 212, 191, 0.55);
      transform: translateY(-50%); pointer-events: none;
    }
    /* Square corners: the seg buttons speak the same machine language as the
       tap pad and BPM rail above them. */
    .you-loop-countin-seg { display: flex; gap: 5px; margin-top: 8px; }
    .you-loop-countin-seg button {
      flex: 1; padding: 6px 0; border-radius: 0; cursor: pointer; font-size: 12px;
      border: 1px solid rgba(255, 255, 255, 0.15); background: transparent; color: #cfd2d2;
      transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
    }
    .you-loop-countin-seg button:hover {
      border-color: rgba(94, 234, 212, 0.5); color: #5eead4;
    }
    .you-loop-countin-seg button[data-active="true"] {
      border-color: #5eead4; color: #5eead4; background: rgba(94, 234, 212, 0.2);
    }
`;
