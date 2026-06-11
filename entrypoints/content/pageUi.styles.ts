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

    .you-loop-timeline {
      height: 100%;
      margin: 0;
      pointer-events: none;
      position: relative;
      width: 100%;
    }

    /* Teal band over the progress bar marking the loop segment. */
    .you-loop-loop-range {
      background: rgba(20, 184, 166, 0.55);
      border-radius: 1px;
      height: 9px;
      pointer-events: none;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }

    .you-loop-handle {
      background: #14b8a6;
      border: 2px solid #ffffff;
      border-radius: 6px;
      box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.6), 0 2px 8px rgba(0, 0, 0, 0.35);
      cursor: ew-resize;
      height: 24px;
      margin: 0;
      padding: 0;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      transform: translate(-50%, -50%);
      width: 10px;
      z-index: 2147483647;
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
      z-index: 2147483647;
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
      transition: color 0.18s ease, background 0.18s ease;
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
      color: rgba(255, 255, 255, 0.85);
    }

    .you-loop-zoom-toggle[data-on="true"] {
      background: rgba(20, 184, 166, 0.18);
      color: #14b8a6;
    }

    /* Dimmed while the loop is off, but still clickable: interacting turns it on. */
    .you-loop-zoom-toggle[data-disabled="true"] {
      opacity: 0.4;
    }

    /* Speed stepper: a compact recessed pill —  ‹ 1× ›  (independent of loop). */
    .you-loop-speed {
      align-items: center;
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 0;
      padding: 2px;
      transition: opacity 0.18s ease;
    }

    .you-loop-speed[data-disabled="true"] {
      opacity: 0.4;
    }

    .you-loop-speed-step {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      display: inline-flex;
      flex: none;
      height: 27px;
      justify-content: center;
      padding: 0;
      transition: color 0.15s ease;
      width: 20px;
    }

    .you-loop-speed-step svg {
      height: 13px;
      width: 13px;
    }

    .you-loop-speed-step:not(:disabled):hover {
      color: #5eead4;
    }

    .you-loop-speed-step:disabled {
      cursor: default;
      opacity: 0.3;
    }

    .you-loop-speed-value {
      background: transparent;
      border: 0;
      color: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      display: grid;
      font-family: "YouTube Sans", "Roboto", system-ui, sans-serif;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: 0.01em;
      min-width: 30px;
      padding: 0;
      place-items: center;
      text-align: center;
      transition: color 0.15s ease;
    }

    /* Number and reset glyph occupy the same cell so swapping them on hover
       never shifts the panel's width. */
    .you-loop-speed-num,
    .you-loop-speed-reset {
      grid-area: 1 / 1;
      transition: opacity 0.12s ease;
    }

    .you-loop-speed-reset {
      display: inline-flex;
      opacity: 0;
    }

    .you-loop-speed-reset svg {
      height: 14px;
      width: 14px;
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

    /* Once the rate is off 1×, hovering the value reveals the reset glyph so
       the click-to-reset affordance is discoverable exactly when it matters. */
    .you-loop-speed-value[data-modified="true"]:not(:disabled):hover .you-loop-speed-num {
      opacity: 0;
    }

    .you-loop-speed-value[data-modified="true"]:not(:disabled):hover .you-loop-speed-reset {
      opacity: 1;
    }

    /* Snap-back pulse confirms the reset click landed. */
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
    .you-loop-zoom-playhead {
      background: #2dd4bf;
      border-radius: 50%;
      height: 20px;
      left: 0;
      pointer-events: none;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      transition: opacity 0.15s ease;
      width: 20px;
      will-change: left;
      /* Sit behind the loop cursors so the larger playhead does not obscure them. */
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

    /* Loop refine cursors: taller teal handles straddling the track. */
    .you-loop-zoom-cursor {
      background: #14b8a6;
      border: 2px solid #ffffff;
      border-radius: 4px;
      box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.6),
        0 2px 8px rgba(0, 0, 0, 0.45);
      cursor: ew-resize;
      height: 20px;
      margin: 0;
      padding: 0;
      pointer-events: auto;
      position: absolute;
      top: 50%;
      touch-action: none;
      transform: translate(-50%, -50%);
      width: 8px;
      will-change: left;
      z-index: 2;
    }

    .you-loop-zoom-cursor:hover {
      box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.8),
        0 0 10px rgba(94, 234, 212, 0.85);
    }

    /* While hovering the zoom track, suppress YouTube's "most replayed" heatmap
       so it does not pop up and obscure the zoom timeline. */
    .html5-video-player:has(.you-loop-zoom-track:hover) .ytp-heat-map-container,
    .html5-video-player:has(.you-loop-zoom-track:hover) .ytp-heat-map-edu {
      opacity: 0 !important;
      pointer-events: none !important;
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
      transition: color 0.18s ease, background 0.18s ease;
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
      max-width: 440px;
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
      color: #5eead4;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.01em;
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
      display: flex;
      flex-direction: column;
      gap: 11px;
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

    .you-loop-help-memory {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 0;
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

    /* Unsaved-changes dot on the toggle. */
    .you-loop-loops-toggle[data-dirty="true"]::after {
      background: #5eead4;
      border-radius: 50%;
      content: "";
      height: 5px;
      position: absolute;
      right: 1px;
      top: 1px;
      width: 5px;
    }

    /* Shared base for the modal's text inputs. */
    .you-loop-loops-input {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
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

    .you-loop-lm-radio {
      align-items: center;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      gap: 10px;
      padding: 6px 6px;
    }

    .you-loop-lm-radio + .you-loop-lm-radio {
      margin-top: 2px;
    }

    .you-loop-lm-radio[data-active="true"] {
      background: rgba(94, 234, 212, 0.08);
    }

    .you-loop-lm-radio[data-disabled="true"] {
      cursor: default;
      opacity: 0.4;
    }

    .you-loop-lm-radio input[type="radio"] {
      accent-color: #5eead4;
      flex: none;
      height: 14px;
      margin: 0;
      width: 14px;
    }

    .you-loop-lm-radio-text {
      color: rgba(255, 255, 255, 0.85);
      flex: none;
      font-size: 12.5px;
      font-weight: 600;
      width: 56px;
    }

    .you-loop-lm-name {
      flex: 1;
    }

    .you-loop-lm-name:disabled {
      opacity: 0.4;
    }

    .you-loop-lm-select {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      flex: 1;
      font-family: inherit;
      font-size: 12.5px;
      min-width: 0;
      padding: 6px 8px;
    }

    .you-loop-lm-select:disabled {
      cursor: default;
      opacity: 0.4;
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
      gap: 2px;
      list-style: none;
      margin: 0;
      max-height: 220px;
      overflow-y: auto;
      padding: 0;
    }

    .you-loop-lm-empty {
      color: rgba(255, 255, 255, 0.45);
      font-size: 12.5px;
      padding: 6px 2px;
    }

    .you-loop-lm-row {
      align-items: center;
      border-radius: 8px;
      display: flex;
      gap: 6px;
      padding: 3px 6px 3px 4px;
    }

    .you-loop-lm-row:hover,
    .you-loop-lm-row[data-selected="true"] {
      background: rgba(255, 255, 255, 0.06);
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

    /* Always reserves its slot so the name doesn't shift when selected. */
    .you-loop-lm-dot {
      background: #5eead4;
      border-radius: 50%;
      flex: none;
      height: 6px;
      visibility: hidden;
      width: 6px;
    }

    .you-loop-lm-dot[data-on="true"] {
      visibility: visible;
    }

    .you-loop-lm-range {
      color: rgba(255, 255, 255, 0.45);
      flex: none;
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
    }

    .you-loop-lm-rename {
      flex: 1;
    }

    .you-loop-lm-actions {
      display: inline-flex;
      gap: 2px;
    }

    .you-loop-lm-actions button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 5px 6px;
    }

    .you-loop-lm-actions button:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }

    /* Reuse the help modal's exit keyframes for the close animation. */
    .you-loop-lm-backdrop[data-closing="true"] {
      animation: you-loop-help-fade-out 0.18s ease both;
    }

    .you-loop-lm-card[data-closing="true"] {
      animation: you-loop-help-sink 0.2s cubic-bezier(0.4, 0, 1, 1) both;
    }
`;
