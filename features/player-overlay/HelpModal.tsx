import { useEffect } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalPresence } from "./useModalPresence";
import { EtudeWordmark } from "./EtudeWordmark";

type Props = {
  open: boolean;
  // The `.html5-video-player` root to portal into. null while not resolved.
  container: HTMLElement | null;
  onClose: () => void;
};

// Must match the you-loop-help-sink animation duration in the stylesheet so the
// card finishes its exit animation before it unmounts.
const HELP_EXIT_MS = 200;

// Our overlay lives inside YouTube's progress bar, which binds its own pointer
// handlers; swallow events so interacting with the modal never scrubs the video.
const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

// Panel-control glyphs, mirrored from the actual controls in LoopPanel so the
// docs read like the panel.
const PowerIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 3.5v7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M7.6 6.6a7 7 0 1 0 8.8 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

// Vertical scrub glyph: up/down arrows around a tick, matching the
// press-and-drag speed control.
const SpeedIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 3.5l-3 3.2h6zM12 20.5l-3-3.2h6z"
      fill="currentColor"
      stroke="none"
    />
    <path
      d="M7.5 12h9"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

const ZoomIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle
      cx="10.5"
      cy="10.5"
      r="6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    />
    <path
      d="M15 15l4.5 4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

// Metronome glyph, mirrored from the count-in control in the panel.
const CountInIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M9 3h6l3 16H6L9 3z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M12 19V7l5-2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SaveIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M7 4h10v16l-5-3.5L7 20z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

type Shortcut = { keys: string; hold?: boolean; name: string; desc: string };
type Control = { icon: ReactNode; term: string; desc: string };

const CONTROLS: Control[] = [
  {
    icon: PowerIcon,
    term: "Power",
    desc: "Turn Étude on or off. Your loop range is kept while off.",
  },
  {
    icon: null,
    term: "Loop / One-shot",
    desc: "Loop repeats the range; one-shot plays it through once and stops.",
  },
  {
    icon: SpeedIcon,
    term: "Speed",
    desc: "Hold the readout and drag up or down to scrub the speed in 0.05× steps (0.25×–3×). Drag it hard right and let go to snap back to 1×; turning Étude off also resets it.",
  },
  {
    icon: ZoomIcon,
    term: "Zoom",
    desc: "Magnify the looped region to fine-tune a precise sub-loop — handy on long videos.",
  },
  {
    icon: CountInIcon,
    term: "Count-in",
    desc: "A metronome counts you in before each loop repeats, so you come in on time. Tap or drag the tempo, pick the time signature and how many bars — the loop resumes on the downbeat.",
  },
  {
    icon: SaveIcon,
    term: "Saved loops",
    desc: "Save the current loop and zoom as a named loop. Keep several per video — apply or delete them anytime — and browse every video you've saved loops on. They come back automatically next visit, last-used applied.",
  },
];

const SHORTCUTS: Shortcut[] = [
  {
    keys: "A",
    name: "Restart",
    desc: "Jump to start of selected region and play.",
  },
  {
    keys: "S",
    hold: true,
    name: "Cue",
    desc: "Play from start of selected region; release snaps back to start.",
  },
  {
    keys: "D",
    hold: true,
    name: "Push-to-play",
    desc: "Play from the playhead; release pauses in place. Hold again to carry on.",
  },
  {
    keys: "[ ]",
    name: "Nudge window",
    desc: "Nudge the loop forward/back a little, keeping the length.",
  },
  {
    keys: "⇧ [ ]",
    name: "Step window",
    desc: "Move the loop forward/back by its own length, keeping the length.",
  },
  {
    keys: "⇧ drag",
    name: "Move window",
    desc: "Hold Shift and drag a loop handle (main timeline or zoom) to slide the whole loop, length unchanged. Releases to the new start.",
  },
];

export function HelpModal({ open, container, onClose }: Props) {
  const { mounted, closing } = useModalPresence(open, HELP_EXIT_MS);

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

  if (!mounted || container == null) return null;

  return createPortal(
    <div
      className="you-loop-help-backdrop"
      data-closing={closing}
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={(event) => {
        swallow(event);
        onClose();
      }}
    >
      <div
        className="you-loop-help-card"
        data-closing={closing}
        role="dialog"
        aria-modal="true"
        aria-label="Étude help"
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
          <span className="you-loop-help-eyebrow"><EtudeWordmark /></span>
          <h2 className="you-loop-help-title">
            Loop, zoom &amp; rehearse any section of a video
          </h2>
          <p className="you-loop-help-intro">
            Set a loop range, zoom in, and change the speed — then take full
            control with purpose-built keyboard shortcuts that make looping
            effortless.
          </p>
        </div>

        <section className="you-loop-help-section">
          <h3 className="you-loop-help-label">Panel</h3>
          <ul className="you-loop-help-list">
            {CONTROLS.map((control) => (
              <li
                key={control.term}
                className="you-loop-help-row you-loop-help-row--panel"
              >
                <span className="you-loop-help-ico">{control.icon}</span>
                <span className="you-loop-help-body">
                  <span className="you-loop-help-term">{control.term}</span>
                  <span className="you-loop-help-desc">{control.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="you-loop-help-section">
          <h3 className="you-loop-help-label">Keyboard</h3>
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
    container,
  );
}
