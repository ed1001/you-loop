import { useEffect } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { quickSaveShortcutLabel } from "../playback/shortcuts";
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

// Loop-arrows glyph, mirrored from the loop/one-shot mode toggle's loop state.
// The glyph is intentionally identical to LoopPanel's — the help entry mirrors
// the real control, so the duplication is deliberate.
const ModeIcon = (
  // fallow-ignore-next-line code-duplication
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M5 9a4 4 0 0 1 4-4h7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <path
      d="M13 2.5 16.5 5 13 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 15a4 4 0 0 1-4 4H8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <path
      d="M11 21.5 7.5 19 11 16.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
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

// Speed and Pitch have no glyph button in the panel — they're readout pills you
// drag. So their "icon" is a miniature of that pill, mirroring what you actually
// look for in the panel.
const SpeedPill = (
  <span className="you-loop-help-pill">
    1<span className="you-loop-help-pill-unit">×</span>
  </span>
);

const PitchPill = (
  <span className="you-loop-help-pill">
    0<span className="you-loop-help-pill-unit">st</span>
  </span>
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

// Ordered by use-flow, not panel position: first set up the loop (on/off,
// mode, region), then shape how it plays back (speed, pitch, count-in), then
// keep it (saved loops).
const CONTROLS: Control[] = [
  {
    icon: PowerIcon,
    term: "Power",
    desc: "Turn Étude on or off. Your loop range is kept while off.",
  },
  {
    icon: ModeIcon,
    term: "Loop / One-shot",
    desc: "Loop repeats the range; one-shot plays it through once and stops.",
  },
  {
    icon: ZoomIcon,
    term: "Zoom",
    desc: "Magnify the looped region to fine-tune a precise sub-loop — handy on long videos.",
  },
  {
    icon: SpeedPill,
    term: "Speed",
    desc: "Hold the readout and drag up or down to scrub the speed in 0.05× steps (0.25×–3×). Drag it hard right and let go to snap back to 1×; turning Étude off also resets it.",
  },
  {
    icon: PitchPill,
    term: "Pitch",
    desc: "Transpose the song without changing its speed. Hold the readout and drag up or down to shift in semitones (±12); hold Shift to zoom the dial into cents and fine-tune, release Shift to zoom back out. Fling right and let go to snap back to 0 — inside cents, the fling zeroes just the cents without ending the scrub.",
  },
  {
    icon: CountInIcon,
    term: "Count-in",
    desc: "A metronome counts you in before the loop starts, so you come in on time. Tap or drag the tempo, pick the time signature and how many bars.",
  },
  {
    icon: SaveIcon,
    term: "Saved loops",
    desc: "Save the current loop, zoom, marks and count-in under a name. Keep several per video and tap one to apply it. The button names the loop you're on and shows a dot once you've changed it. Open it to save your changes or keep them as a new loop.",
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
    keys: quickSaveShortcutLabel(),
    name: "Save loop",
    desc: "Save your changes to the loop you're on. Not on a saved loop yet? Opens Saved loops to name a new one.",
  },
  {
    keys: "⇧ drag",
    name: "Move window",
    desc: "Hold Shift and drag a loop handle (main timeline or zoom) to slide the whole loop, length unchanged. Releases to the new start.",
  },
  {
    keys: "⇧ click",
    name: "Practice marks",
    desc: "Shift-click the zoom strip to drop a mark. Click a mark to activate/deactivate it — while active, the loop plays from that mark. Shift-click a mark to remove it.",
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
          <ul className="you-loop-help-list you-loop-help-list--panel">
            {CONTROLS.map((control) => (
              <li
                key={control.term}
                className="you-loop-help-row you-loop-help-row--panel"
              >
                <span className="you-loop-help-body">
                  <span className="you-loop-help-term">
                    {control.icon && (
                      <span className="you-loop-help-glyph" aria-hidden="true">
                        {control.icon}
                      </span>
                    )}
                    {control.term}
                  </span>
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
