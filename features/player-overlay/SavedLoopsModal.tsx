import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { LoopSegment } from "../playback/types";
import type { SavedLoop } from "../persistence/loopStore";
import { quickSaveShortcutLabel } from "../playback/shortcuts";
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
  // The loop the live state came from (even if since edited): its row is
  // marked and the footer names it. Null when there is none.
  activeLoop: SavedLoop | null;
  // Live state differs from `activeLoop`.
  activeDirty: boolean;
  // Bumped to focus the new-loop name field when the modal opens or is
  // already open (quick-save with no active loop).
  focusNameToken: number;
  onSaveChanges: () => void;
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
  activeLoop,
  activeDirty,
  focusNameToken,
  onSaveChanges,
  duration,
  onClose,
  onSaveAsNew,
  onEditLoop,
  onApply,
  onDelete,
}: Props) {
  const [newName, setNewName] = useState("");
  // On an active loop the footer shows its status and actions; "Save as new"
  // swaps that for the name field until saved or cancelled. With no active
  // loop the name field is all the footer has, so this flag is moot.
  const [naming, setNaming] = useState(false);
  // The row (if any) currently in pencil-edit mode, replacing its normal
  // apply/actions content with the name field + replace button. Retargets to
  // whichever row's pencil was clicked most recently; null once committed or
  // cancelled.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // Draft flag: "replace this loop's state with the current one" is armed by
  // its toggle but only committed by Save, so Cancel can still discard it.
  const [replaceArmed, setReplaceArmed] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const newNameRef = useRef<HTMLInputElement | null>(null);
  // The focus request already honoured, so reopening the modal normally
  // doesn't re-focus the name field.
  const handledFocusToken = useRef(0);
  const activeRowRef = useRef<HTMLLIElement | null>(null);
  const editingRowRef = useRef<HTMLLIElement | null>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const { mounted, closing } = useModalPresence(open, EXIT_MS);

  const activeId = activeLoop?.id ?? null;
  const showNameField = activeLoop == null || naming;

  // Bring the active loop into view when the modal opens AND when it changes
  // — saving a new loop appends it at the end of an overflowing list and
  // makes it active, so this is what scrolls the fresh row into view.
  // `nearest` makes it a no-op for rows already visible.
  useEffect(() => {
    if (!open || !mounted) return;
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, activeId]);

  // The pencil-edit form grows its row; a row at the clipped bottom edge of
  // the list would otherwise expand out of sight. Runs after the form has
  // rendered, so the row's grown height is what gets scrolled into view.
  useEffect(() => {
    if (editingId == null) return;
    editingRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [editingId]);

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
    setNaming(false);
    setEditingId(null);
    setEditName("");
    setReplaceArmed(false);
    // Intentionally only re-seed on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus the save-as-new field on request. Runs after the open-seed effect
  // above, so the field is empty and ready to type into.
  useEffect(() => {
    if (!open || !mounted) return;
    if (focusNameToken === handledFocusToken.current) return;
    handledFocusToken.current = focusNameToken;
    newNameRef.current?.focus();
  }, [open, mounted, focusNameToken]);

  // "Save as new" reveals the name field; put the caret in it.
  useEffect(() => {
    if (naming) newNameRef.current?.focus();
  }, [naming]);

  // Block YouTube's capture-phase shortcut handlers while interacting with the
  // modal: stop propagation from window (above document) without preventDefault
  // so typing, selects, and button activation still work. Esc backs out one
  // level at a time: an open pencil edit or save-as-new name field cancels
  // first, and only an Esc with neither open closes the modal. Enter in a text
  // field commits it.
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
          setReplaceArmed(false);
        } else if (naming && activeId != null) {
          setNaming(false);
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
  }, [open, onClose, editingId, naming, activeId]);

  if (!mounted || container == null) return null;

  // Saving an identical state is allowed by design; only an empty name blocks it.
  const canSave = newName.trim() !== "";

  const handleSave = () => {
    if (!canSave) return;
    onSaveAsNew(newName.trim());
    setNewName("");
    setNaming(false);
  };

  // A blank or unchanged name is a no-op on the name field — only a real,
  // non-empty rename is forwarded.
  const resolveEditName = (loop: SavedLoop): string | undefined => {
    const trimmed = editName.trim();
    return trimmed !== loop.name && trimmed !== "" ? trimmed : undefined;
  };

  // Everything in the edit form is a draft until Save: the name field AND the
  // armed replace toggle commit together, so Cancel genuinely discards both.
  const commitEdit = (loop: SavedLoop) => {
    onEditLoop(loop.id, {
      name: resolveEditName(loop),
      replaceState: replaceArmed || undefined
    });
    setEditingId(null);
    setReplaceArmed(false);
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

        <h2 className="you-loop-lm-title">Saved loops</h2>

        <ul
          className="you-loop-lm-list"
          ref={listRef}
          data-fade-top={fadeTop}
          data-fade-bottom={fadeBottom}
          onScroll={updateFade}
        >
            {loops.length === 0 && (
              <li className="you-loop-lm-empty">
                Nothing saved for this video yet. Name your current loop below
                to keep it.
              </li>
            )}
            {loops.map((loop) => {
              const editing = loop.id === editingId;
              return (
                <li
                  key={loop.id}
                  ref={
                    editing
                      ? editingRowRef
                      : loop.id === activeId
                        ? activeRowRef
                        : undefined
                  }
                  className="you-loop-lm-row"
                  data-selected={loop.id === activeId}
                  data-dirty={loop.id === activeId && activeDirty}
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
                          aria-pressed={replaceArmed}
                          data-armed={replaceArmed}
                          onClick={(e) => {
                            swallow(e);
                            setReplaceArmed((armed) => !armed);
                          }}
                        >
                          <span className="you-loop-lm-check" aria-hidden="true" />
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
                              setReplaceArmed(false);
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
                        <span className="you-loop-lm-name">
                          <span className="you-loop-lm-name-text">
                            {loop.name}
                          </span>
                          {activeDirty && loop.id === activeId && (
                            <span
                              className="you-loop-lm-dot"
                              aria-hidden="true"
                            />
                          )}
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
                            setReplaceArmed(false);
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
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </span>
                    </>
                  )}
                </li>
              );
            })}
        </ul>

        {/* Docked footer: everything about the loop you're on right now.
            Either its status and the two ways to keep it, or the name field
            for saving it as a new loop. */}
        <footer className="you-loop-lm-foot">
          {activeLoop != null && !showNameField ? (
            <>
              <p className="you-loop-lm-now">
                <span className="you-loop-lm-now-text">
                  You’re on <strong>{activeLoop.name}</strong>
                </span>
                <span className="you-loop-lm-status" data-edited={activeDirty}>
                  {activeDirty ? "Edited" : "Saved"}
                </span>
              </p>
              <div className="you-loop-lm-now-actions">
                <button
                  type="button"
                  className="you-loop-lm-btn"
                  data-primary={activeDirty}
                  onClick={(event) => {
                    swallow(event);
                    onSaveChanges();
                  }}
                >
                  Save changes
                  <kbd className="you-loop-lm-kbd" aria-hidden="true">
                    {quickSaveShortcutLabel()}
                  </kbd>
                </button>
                <button
                  type="button"
                  className="you-loop-lm-btn"
                  onClick={(event) => {
                    swallow(event);
                    setNaming(true);
                  }}
                >
                  Save as new
                </button>
              </div>
            </>
          ) : (
            <div className="you-loop-lm-new">
              <input
                ref={newNameRef}
                className="you-loop-loops-input you-loop-lm-new-name"
                data-loops-field="new"
                type="text"
                placeholder="Name this loop"
                aria-label="Name this loop"
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
              {activeLoop != null && (
                <button
                  type="button"
                  className="you-loop-lm-btn you-loop-lm-btn--quiet"
                  onClick={(event) => {
                    swallow(event);
                    setNaming(false);
                    setNewName("");
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="you-loop-lm-btn"
                data-primary="true"
                disabled={!canSave}
                onClick={(event) => {
                  swallow(event);
                  handleSave();
                }}
              >
                Save
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>,
    container,
  );
}
