// Styles for the shared saved-videos list. Interpolated into PAGE_UI_STYLES
// (saved-loops modal) and rendered as a <style> tag by the popup.
export const VIDEO_LIST_STYLES = `
    .you-loop-lm-empty {
      color: rgba(255, 255, 255, 0.45);
      font-size: 12.5px;
      padding: 6px 2px;
    }

    .you-loop-lm-vlist {
      display: flex;
      flex-direction: column;
      gap: 6px;
      list-style: none;
      margin: 0;
      max-height: 320px;
      overflow-y: auto;
      padding: 0;
    }

    .you-loop-lm-vopen {
      align-items: center;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      color: #fff;
      cursor: pointer;
      display: flex;
      flex: 1;
      font-family: inherit;
      gap: 12px;
      justify-content: space-between;
      min-width: 0;
      padding: 11px 12px;
      text-align: left;
      transition: border-color 0.15s ease, background 0.15s ease;
      width: 100%;
    }

    .you-loop-lm-vopen:not(:disabled):hover {
      background: rgba(94, 234, 212, 0.07);
      border-color: rgba(94, 234, 212, 0.5);
    }

    /* The currently-playing video stays listed but isn't a navigation target. */
    .you-loop-lm-vrow[data-current="true"] .you-loop-lm-vopen {
      border-color: rgba(94, 234, 212, 0.35);
      cursor: default;
    }

    .you-loop-lm-vname {
      font-size: 13px;
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .you-loop-lm-vmeta {
      align-items: center;
      color: rgba(255, 255, 255, 0.5);
      display: inline-flex;
      flex: none;
      gap: 8px;
    }

    /* Recessed count chip, same vocabulary as the kbd keys and speed well. */
    .you-loop-lm-vcount {
      background: rgba(0, 0, 0, 0.34);
      border-radius: 999px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55),
        inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      padding: 3px 9px;
      transition: color 0.15s ease;
      white-space: nowrap;
    }

    .you-loop-lm-vopen:not(:disabled):hover .you-loop-lm-vcount {
      color: #5eead4;
    }

    /* Rows cascade in as the pane mounts — a quick stagger that makes the
       library feel assembled rather than dumped. Capped after the first rows
       so long lists don't keep the tail invisible. */
    .you-loop-lm-vrow {
      animation: you-loop-pane-in 0.26s cubic-bezier(0.16, 1, 0.3, 1) both;
      display: flex;
      gap: 6px;
    }

    .you-loop-lm-vrow:nth-child(2) { animation-delay: 0.035s; }
    .you-loop-lm-vrow:nth-child(3) { animation-delay: 0.07s; }
    .you-loop-lm-vrow:nth-child(4) { animation-delay: 0.105s; }
    .you-loop-lm-vrow:nth-child(5) { animation-delay: 0.14s; }
    .you-loop-lm-vrow:nth-child(n + 6) { animation-delay: 0.17s; }

    @keyframes you-loop-pane-in {
      from {
        opacity: 0;
        transform: translateY(7px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .you-loop-lm-vnow {
      background: rgba(94, 234, 212, 0.16);
      border-radius: 999px;
      color: #5eead4;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      text-transform: uppercase;
    }

    /* A teal chevron slides in on hover, signalling the row navigates. */
    .you-loop-lm-vgo {
      color: rgba(94, 234, 212, 0.7);
      height: 16px;
      opacity: 0;
      transform: translateX(-3px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      width: 16px;
    }

    .you-loop-lm-vopen:hover .you-loop-lm-vgo {
      opacity: 1;
      transform: translateX(0);
    }

    /* Delete sits beside the row, hidden until hover (or keyboard focus, or
       while armed). Arming turns it red and swaps ✕ for "Delete?". */
    .you-loop-lm-vdel {
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      color: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      flex: none;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      opacity: 0;
      padding: 0 10px;
      transition: opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    .you-loop-lm-vrow:hover .you-loop-lm-vdel,
    .you-loop-lm-vdel:focus-visible,
    .you-loop-lm-vdel[data-confirming="true"] {
      opacity: 1;
    }

    .you-loop-lm-vdel:hover,
    .you-loop-lm-vdel[data-confirming="true"] {
      border-color: rgba(248, 113, 113, 0.5);
      color: #f87171;
    }
`;
