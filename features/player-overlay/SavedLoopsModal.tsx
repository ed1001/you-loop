import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { LoopSegment } from "../playback/types";
import type { SavedLoop } from "../persistence/loopStore";
import type { CountInSettings } from "../persistence/countInStore";
import { useModalPresence } from "./useModalPresence";

// Must match the you-loop-help-sink duration so the card finishes its exit
// before it unmounts.
const EXIT_MS = 200;
// Loop names are short labels; keep them from overrunning the row.
const NAME_MAX_LENGTH = 40;

type Props = {
  open: boolean;
  // Portaled into the .html5-video-player root so the card sits above the
  // player chrome and its events stay out of YouTube's progress bar.
  container: HTMLElement | null;
  loops: SavedLoop[];
  selectedId: string | null;
  currentSegment: LoopSegment | null;
  // False when the current selection already matches the selected saved loop,
  // so there's nothing new to save.
  dirty: boolean;
  // The saved loop the current selection was seeded from, if any. While the
  // selection has drifted off it, its row gets the dashed origin ring below.
  sourceLoop?: SavedLoop;
  // Total video length in seconds, for positioning each row's loop-map band.
  duration: number;
  onClose: () => void;
  onSaveAsNew: (name: string) => void;
  onUpdateLoop: (id: string) => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
  // Feed describeDelta's changed-field comparison for the update block.
  currentZoom: LoopSegment | null;
  currentCountIn: CountInSettings;
};

const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

// Inputs/selects must focus on click, so don't preventDefault their pointer
// events (that cancels focus) — stop propagation only.
const stopOnly = (event: MouseEvent | PointerEvent) => {
  event.stopPropagation();
};

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRange(segment: LoopSegment | null): string {
  if (segment == null) return "—";
  return `${formatTime(segment.start)} – ${formatTime(segment.end)}`;
}

// Two loop segments are equal when both null or both endpoints match.
function regionsEqual(a: LoopSegment | null, b: LoopSegment | null): boolean {
  if (a == null || b == null) return a === b;
  return a.start === b.start && a.end === b.end;
}

function pluralBars(bars: number): string {
  return `${bars} bar${bars === 1 ? "" : "s"}`;
}

// Pure summary of what an update-in-place would change, most-visible fields
// first (region, then zoom, then tempo). Only changed fields render — an
// unchanged field would be noise next to the button that commits it. Legacy
// sources (no count-in snapshot) never compare tempo: there is nothing to
// diff against, matching isLoopDirty's own legacy handling in pageUi.tsx.
export function describeDelta(
  source: SavedLoop,
  segment: LoopSegment | null,
  zoom: LoopSegment | null,
  countIn: CountInSettings
): string {
  const parts: string[] = [];

  if (!regionsEqual(source.main, segment)) {
    parts.push(`${formatRange(source.main)} → ${formatRange(segment)}`);
  }
  if (!regionsEqual(source.zoom, zoom)) {
    parts.push(`zoom ${formatRange(source.zoom)} → ${formatRange(zoom)}`);
  }
  if (source.countIn != null) {
    const from = source.countIn;
    if (from.bpm !== countIn.bpm) {
      parts.push(`♩${from.bpm} → ${countIn.bpm}`);
    }
    if (from.beatsPerBar !== countIn.beatsPerBar || from.noteValue !== countIn.noteValue) {
      parts.push(
        `${from.beatsPerBar}/${from.noteValue} → ${countIn.beatsPerBar}/${countIn.noteValue}`
      );
    }
    if (from.bars !== countIn.bars) {
      parts.push(`${pluralBars(from.bars)} → ${pluralBars(countIn.bars)}`);
    }
  }

  return parts.join(" · ");
}

export function SavedLoopsModal({
  open,
  container,
  loops,
  selectedId,
  currentSegment,
  dirty,
  sourceLoop,
  duration,
  onClose,
  onSaveAsNew,
  onUpdateLoop,
  onApply,
  onDelete,
  currentZoom,
  currentCountIn,
}: Props) {
  const [newName, setNewName] = useState("");
  // The row (if any) currently showing the inline confirm strip in place of
  // its normal apply/actions content. Retargets to whichever row's ↻ was
  // clicked most recently; null once confirmed or cancelled.
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const selectedRowRef = useRef<HTMLLIElement | null>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const { mounted, closing } = useModalPresence(open, EXIT_MS);

  // Bring the currently-selected loop into view each time the modal opens, so
  // it's visible even when the list overflows.
  useEffect(() => {
    if (!open || !mounted) return;
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // Fade whichever edge has clipped rows beyond it (content above when scrolled
  // down, content below when not at the end), as an obvious "more here" cue
  // without dimming a fully-visible first/last row.
  const updateFade = () => {
    const el = listRef.current;
    if (el == null) return;
    setFadeTop(el.scrollTop > 1);
    setFadeBottom(el.scrollHeight - el.clientHeight - el.scrollTop > 1);
  };

  // Re-measure when the modal opens or the list contents change.
  useEffect(() => {
    updateFade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, open, loops.length]);

  // Seed the save form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setNewName("");
    setPendingUpdateId(null);
    // Intentionally only re-seed on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Block YouTube's capture-phase shortcut handlers while interacting with the
  // modal: stop propagation from window (above document) without preventDefault
  // so typing, selects, and button activation still work. Esc backs out one
  // level at a time: a pending row update cancels first, and only a second Esc
  // (with nothing pending) closes the modal. Enter in a text field commits it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        target.closest(".you-loop-lm") == null
      ) {
        return;
      }
      event.stopPropagation();
      if (event.type !== "keydown") return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (pendingUpdateId != null) {
          setPendingUpdateId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("keypress", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("keypress", onKey, true);
    };
  }, [open, onClose, pendingUpdateId]);

  if (!mounted || container == null) return null;

  // Saving an identical state is allowed by design; only an empty name blocks it.
  const canSave = newName.trim() !== "";

  const handleSave = () => {
    if (!canSave) return;
    onSaveAsNew(newName.trim());
    setNewName("");
  };

  return createPortal(
    <div
      className="you-loop-lm you-loop-lm-backdrop"
      data-closing={closing}
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={(event) => {
        swallow(event);
        onClose();
      }}
    >
      <div
        className="you-loop-lm-card"
        data-closing={closing}
        role="dialog"
        aria-modal="true"
        aria-label="Saved loops"
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <button
          type="button"
          className="you-loop-lm-close"
          aria-label="Close saved loops"
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

        <header className="you-loop-lm-head">
          <h2 className="you-loop-lm-title">Saved loops</h2>
          <p className="you-loop-lm-sub">
            {`Current selection · ${formatRange(currentSegment)}`}
          </p>
        </header>

        <section className="you-loop-lm-list-wrap">
          <h3 className="you-loop-lm-label">Your loops</h3>
          <ul
            className="you-loop-lm-list"
            ref={listRef}
            data-fade-top={fadeTop}
            data-fade-bottom={fadeBottom}
            onScroll={updateFade}
          >
            {loops.length === 0 && (
              <li className="you-loop-lm-empty">
                No saved loops yet. Save the current selection below.
              </li>
            )}
            {loops.map((loop) => {
              const pending = loop.id === pendingUpdateId;
              // The row the current (drifted) selection came from stays
              // findable via a dashed ring once it's no longer the selected
              // row itself.
              const isOrigin =
                dirty && sourceLoop != null && sourceLoop.id === loop.id;
              return (
                <li
                  key={loop.id}
                  ref={loop.id === selectedId ? selectedRowRef : undefined}
                  className="you-loop-lm-row"
                  data-selected={loop.id === selectedId}
                  data-pending={pending}
                  data-origin={isOrigin}
                >
                  {pending ? (
                    <div className="you-loop-lm-confirm">
                      <span className="you-loop-lm-confirm-info">
                        <span className="you-loop-lm-confirm-name">
                          {loop.name}
                        </span>
                        <span className="you-loop-lm-confirm-delta">
                          {describeDelta(
                            loop,
                            currentSegment,
                            currentZoom,
                            currentCountIn
                          ) || "No changes"}
                        </span>
                      </span>
                      <span className="you-loop-lm-confirm-actions">
                        <button
                          type="button"
                          className="you-loop-lm-confirm-yes"
                          aria-label={`Confirm update of ${loop.name}`}
                          title="Confirm update"
                          onClick={(e) => {
                            swallow(e);
                            onUpdateLoop(loop.id);
                            setPendingUpdateId(null);
                          }}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="you-loop-lm-confirm-cancel"
                          aria-label="Cancel update"
                          title="Cancel"
                          onClick={(e) => {
                            swallow(e);
                            setPendingUpdateId(null);
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="you-loop-lm-apply"
                        title={`Apply “${loop.name}”`}
                        aria-label={`Apply ${loop.name}`}
                        onClick={(e) => {
                          swallow(e);
                          onApply(loop.id);
                        }}
                      >
                        <span className="you-loop-lm-name-text">
                          {loop.name}
                        </span>
                        {loop.countIn != null && (
                          <span className="you-loop-lm-tempo">
                            {`♩${loop.countIn.bpm} · ${loop.countIn.beatsPerBar}/${loop.countIn.noteValue}`}
                          </span>
                        )}
                        <span className="you-loop-lm-range">
                          {formatRange(loop.main)}
                        </span>
                      </button>

                      <span className="you-loop-lm-actions">
                        <button
                          type="button"
                          aria-label={`Update ${loop.name} with current loop`}
                          title="Update"
                          onClick={(e) => {
                            swallow(e);
                            setPendingUpdateId(loop.id);
                          }}
                        >
                          ↻
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${loop.name}`}
                          title="Delete"
                          onClick={(e) => {
                            swallow(e);
                            onDelete(loop.id);
                          }}
                        >
                          ✕
                        </button>
                      </span>

                      <span className="you-loop-lm-map" aria-hidden="true">
                        <span
                          className="you-loop-lm-map-band"
                          style={{
                            left: `${(loop.main.start / duration) * 100}%`,
                            width: `${((loop.main.end - loop.main.start) / duration) * 100}%`
                          }}
                        />
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="you-loop-lm-save">
          <h3 className="you-loop-lm-label">Save current loop</h3>

          <input
            className="you-loop-loops-input you-loop-lm-name"
            data-loops-field="new"
            type="text"
            placeholder="Name this loop"
            maxLength={NAME_MAX_LENGTH}
            value={newName}
            onPointerDown={stopOnly}
            onMouseDown={stopOnly}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
          />

          <button
            type="button"
            className="you-loop-lm-savebtn"
            disabled={!canSave}
            onClick={(event) => {
              swallow(event);
              handleSave();
            }}
          >
            Save
          </button>
        </section>
      </div>
    </div>,
    container,
  );
}
