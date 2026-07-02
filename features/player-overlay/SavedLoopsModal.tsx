import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { LoopSegment } from "../playback/types";
import type { SavedLoop } from "../persistence/loopStore";
import { useModalPresence } from "./useModalPresence";

// Must match the you-loop-help-sink duration so the card finishes its exit
// before it unmounts.
const EXIT_MS = 200;
// Loop names are short labels; keep them from overrunning the row.
const NAME_MAX_LENGTH = 40;

type EditPatch = { name?: string; replaceState?: boolean };

type Props = {
  open: boolean;
  // Portaled into the .html5-video-player root so the card sits above the
  // player chrome and its events stay out of YouTube's progress bar.
  container: HTMLElement | null;
  loops: SavedLoop[];
  selectedId: string | null;
  // Total video length in seconds, for positioning each row's loop-map band.
  duration: number;
  onClose: () => void;
  onSaveAsNew: (name: string) => void;
  onEditLoop: (id: string, patch: EditPatch) => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
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

export function SavedLoopsModal({
  open,
  container,
  loops,
  selectedId,
  duration,
  onClose,
  onSaveAsNew,
  onEditLoop,
  onApply,
  onDelete,
}: Props) {
  const [newName, setNewName] = useState("");
  // The row (if any) currently in pencil-edit mode, replacing its normal
  // apply/actions content with the name field + replace button. Retargets to
  // whichever row's pencil was clicked most recently; null once committed or
  // cancelled.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
    setEditingId(null);
    setEditName("");
    // Intentionally only re-seed on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Block YouTube's capture-phase shortcut handlers while interacting with the
  // modal: stop propagation from window (above document) without preventDefault
  // so typing, selects, and button activation still work. Esc backs out one
  // level at a time: an open pencil edit cancels first, and only a second Esc
  // (with nothing being edited) closes the modal. Enter in a text field commits
  // it.
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
        if (editingId != null) {
          setEditingId(null);
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
  }, [open, onClose, editingId]);

  if (!mounted || container == null) return null;

  // Saving an identical state is allowed by design; only an empty name blocks it.
  const canSave = newName.trim() !== "";

  const handleSave = () => {
    if (!canSave) return;
    onSaveAsNew(newName.trim());
    setNewName("");
  };

  // A blank or unchanged name is a no-op on the name field — only a real,
  // non-empty rename is forwarded.
  const resolveEditName = (loop: SavedLoop): string | undefined => {
    const trimmed = editName.trim();
    return trimmed !== loop.name && trimmed !== "" ? trimmed : undefined;
  };

  const commitEdit = (loop: SavedLoop) => {
    onEditLoop(loop.id, { name: resolveEditName(loop) });
    setEditingId(null);
  };

  const commitReplace = (loop: SavedLoop) => {
    onEditLoop(loop.id, { name: resolveEditName(loop), replaceState: true });
    setEditingId(null);
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
              const editing = loop.id === editingId;
              return (
                <li
                  key={loop.id}
                  ref={loop.id === selectedId ? selectedRowRef : undefined}
                  className="you-loop-lm-row"
                  data-selected={loop.id === selectedId}
                  data-editing={editing}
                >
                  <span className="you-loop-lm-map" aria-hidden="true">
                    <span
                      className="you-loop-lm-map-band"
                      style={{
                        left: `${(loop.main.start / duration) * 100}%`,
                        width: `${((loop.main.end - loop.main.start) / duration) * 100}%`
                      }}
                    />
                  </span>

                  {editing ? (
                    <div className="you-loop-lm-edit-row">
                      <input
                        type="text"
                        className="you-loop-loops-input you-loop-lm-edit-name"
                        maxLength={NAME_MAX_LENGTH}
                        value={editName}
                        aria-label="Loop name"
                        onPointerDown={stopOnly}
                        onMouseDown={stopOnly}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit(loop);
                          }
                        }}
                      />
                      <div className="you-loop-lm-edit-line">
                        <button
                          type="button"
                          className="you-loop-lm-replace"
                          aria-label={`Replace ${loop.name} with current loop`}
                          onClick={(e) => {
                            swallow(e);
                            commitReplace(loop);
                          }}
                        >
                          Replace with current loop
                        </button>
                        <span className="you-loop-lm-edit-actions">
                          <button
                            type="button"
                            className="you-loop-lm-edit-cancel"
                            aria-label="Cancel edit"
                            onClick={(e) => {
                              swallow(e);
                              setEditingId(null);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="you-loop-lm-edit-save"
                            aria-label={`Save changes to ${loop.name}`}
                            onClick={(e) => {
                              swallow(e);
                              commitEdit(loop);
                            }}
                          >
                            Save
                          </button>
                        </span>
                      </div>
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
                        <span className="you-loop-lm-range">
                          {formatRange(loop.main)}
                        </span>
                      </button>

                      <span className="you-loop-lm-actions">
                        <button
                          type="button"
                          className="you-loop-lm-edit"
                          aria-label={`Edit ${loop.name}`}
                          title="Edit"
                          onClick={(e) => {
                            swallow(e);
                            setEditingId(loop.id);
                            setEditName(loop.name);
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M4 20l4-1 11-11-3-3L5 16l-1 4z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="you-loop-lm-delete"
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
