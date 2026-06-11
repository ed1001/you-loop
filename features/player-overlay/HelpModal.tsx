import { useEffect } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  // The `.html5-video-player` root to portal into. null while not resolved.
  container: HTMLElement | null;
  onClose: () => void;
};

// Our overlay lives inside YouTube's progress bar, which binds its own pointer
// handlers; swallow events so interacting with the modal never scrubs the video.
const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

type Shortcut = { keys: string; hold?: boolean; name: string; desc: string };
type Control = { term: string; desc: string };

const CONTROLS: Control[] = [
  { term: "Power", desc: "Turn the loop range on or off." },
  {
    term: "Loop / One-shot",
    desc: "Loop repeats the range; one-shot plays it through once and stops."
  },
  {
    term: "Speed − ＋",
    desc: "Step playback speed up or down. Resets to 1× when the loop turns off."
  },
  {
    term: "Zoom",
    desc: "Magnify the looped region for finer, more precise sub-loops."
  }
];

const SHORTCUTS: Shortcut[] = [
  { keys: "A", name: "Restart", desc: "Jump to the loop start and play." },
  {
    keys: "S",
    hold: true,
    name: "Punch-in",
    desc: "Play from the loop start; release snaps back to it."
  },
  {
    keys: "D",
    hold: true,
    name: "Push-to-hear",
    desc: "Play from the playhead; release pauses in place."
  }
];

export function HelpModal({ open, container, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || container == null) return null;

  return createPortal(
    <div
      className="you-loop-help-backdrop"
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={(event) => {
        swallow(event);
        onClose();
      }}
    >
      <div
        className="you-loop-help-card"
        role="dialog"
        aria-modal="true"
        aria-label="you-loop help"
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <button
          type="button"
          className="you-loop-help-close"
          aria-label="Close help"
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(event) => {
            swallow(event);
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="you-loop-help-head">
          <span className="you-loop-help-eyebrow">you-loop</span>
          <h2 className="you-loop-help-title">
            Loop, zoom &amp; rehearse any section of a video
          </h2>
          <p className="you-loop-help-intro">
            Set a range on the timeline, then refine it, repeat it, slow it
            down, and drive playback straight from the keyboard.
          </p>
        </div>

        <section className="you-loop-help-section">
          <h3 className="you-loop-help-label">Panel</h3>
          <ul className="you-loop-help-list">
            {CONTROLS.map((control) => (
              <li key={control.term} className="you-loop-help-row">
                <span className="you-loop-help-term">{control.term}</span>
                <span className="you-loop-help-desc">{control.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="you-loop-help-section">
          <h3 className="you-loop-help-label">
            Keyboard
            <span className="you-loop-help-note"> — while the loop is on</span>
          </h3>
          <ul className="you-loop-help-list">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys} className="you-loop-help-row">
                <span className="you-loop-help-keys">
                  <kbd className="you-loop-kbd">{shortcut.keys}</kbd>
                  {shortcut.hold && (
                    <span className="you-loop-help-hold">hold</span>
                  )}
                </span>
                <span className="you-loop-help-body">
                  <span className="you-loop-help-term">{shortcut.name}</span>
                  <span className="you-loop-help-desc">{shortcut.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="you-loop-help-foot">
          Shortcuts work while the loop is on, and are ignored while you type.
        </p>
      </div>
    </div>,
    container
  );
}
