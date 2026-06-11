import { useEffect, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { LoopSegment } from "../playback/types";
import type { SavedLoop } from "../persistence/loopStore";

// Must match the you-loop-help-sink duration so the card finishes its exit
// before it unmounts.
const EXIT_MS = 200;

type Props = {
  open: boolean;
  // Portaled into the .html5-video-player root so the card sits above the
  // player chrome and its events stay out of YouTube's progress bar.
  container: HTMLElement | null;
  loops: SavedLoop[];
  selectedId: string | null;
  currentSegment: LoopSegment | null;
  onClose: () => void;
  onSaveAsNew: (name: string) => void;
  onReplace: (id: string) => void;
  onApply: (id: string) => void;
  onRename: (id: string, name: string) => void;
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

type SaveMode = "new" | "replace";

export function SavedLoopsModal({
  open,
  container,
  loops,
  selectedId,
  currentSegment,
  onClose,
  onSaveAsNew,
  onReplace,
  onApply,
  onRename,
  onDelete
}: Props) {
  const [mode, setMode] = useState<SaveMode>("new");
  const [newName, setNewName] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  // Stay mounted briefly after `open` flips false so the card can play its exit
  // animation before unmounting (mirrors HelpModal).
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setMounted(true);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Seed the save form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setNewName("");
    setRenamingId(null);
    setMode(loops.length === 0 ? "new" : mode);
    setReplaceId(selectedId ?? loops[0]?.id ?? null);
    // Intentionally only re-seed on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Block YouTube's capture-phase shortcut handlers while interacting with the
  // modal: stop propagation from window (above document) without preventDefault
  // so typing, selects, and button activation still work. Esc closes; Enter in
  // a text field commits it.
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
        onClose();
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
  }, [open, onClose]);

  if (!mounted || container == null) return null;

  const canSave = mode === "new" ? newName.trim() !== "" : replaceId != null;

  const handleSave = () => {
    if (mode === "new") {
      const name = newName.trim();
      if (name === "") return;
      onSaveAsNew(name);
      setNewName("");
    } else if (replaceId != null) {
      // Overwrite the chosen loop; the modal stays open.
      onReplace(replaceId);
    }
  };

  const commitRename = (id: string) => {
    const name = renameText.trim();
    if (name !== "") onRename(id, name);
    setRenamingId(null);
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
            Current selection · {formatRange(currentSegment)}
          </p>
        </header>

        <section className="you-loop-lm-list-wrap">
          <h3 className="you-loop-lm-label">Your loops</h3>
          <ul className="you-loop-lm-list">
            {loops.length === 0 && (
              <li className="you-loop-lm-empty">
                No saved loops yet. Save the current selection below.
              </li>
            )}
            {loops.map((loop) => (
              <li
                key={loop.id}
                className="you-loop-lm-row"
                data-selected={loop.id === selectedId}
              >
                {renamingId === loop.id ? (
                  <input
                    className="you-loop-loops-input you-loop-lm-rename"
                    data-loops-field="rename"
                    type="text"
                    autoFocus
                    value={renameText}
                    onPointerDown={stopOnly}
                    onMouseDown={stopOnly}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => commitRename(loop.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename(loop.id);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="you-loop-lm-apply"
                    onClick={(e) => {
                      swallow(e);
                      onApply(loop.id);
                    }}
                  >
                    <span className="you-loop-lm-name-text">
                      <span
                        className="you-loop-lm-dot"
                        data-on={loop.id === selectedId}
                        aria-hidden="true"
                      />
                      {loop.name}
                    </span>
                    <span className="you-loop-lm-range">
                      {formatRange(loop.main)}
                    </span>
                  </button>
                )}

                <span className="you-loop-lm-actions">
                  <button
                    type="button"
                    aria-label={`Rename ${loop.name}`}
                    title="Rename"
                    onClick={(e) => {
                      swallow(e);
                      setRenamingId(loop.id);
                      setRenameText(loop.name);
                    }}
                  >
                    ✎
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
              </li>
            ))}
          </ul>
        </section>

        <section className="you-loop-lm-save">
          <h3 className="you-loop-lm-label">Save current loop</h3>

          <label className="you-loop-lm-radio" data-active={mode === "new"}>
            <input
              type="radio"
              name="you-loop-save-mode"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            <span className="you-loop-lm-radio-text">As new</span>
            <input
              className="you-loop-loops-input you-loop-lm-name"
              data-loops-field="new"
              type="text"
              placeholder="name this loop"
              value={newName}
              onFocus={() => setMode("new")}
              onPointerDown={stopOnly}
              onMouseDown={stopOnly}
              onChange={(e) => {
                setMode("new");
                setNewName(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </label>

          <label
            className="you-loop-lm-radio"
            data-active={mode === "replace"}
            data-disabled={loops.length === 0}
          >
            <input
              type="radio"
              name="you-loop-save-mode"
              checked={mode === "replace"}
              disabled={loops.length === 0}
              onChange={() => setMode("replace")}
            />
            <span className="you-loop-lm-radio-text">Replace</span>
            <select
              className="you-loop-lm-select"
              value={replaceId ?? ""}
              disabled={loops.length === 0}
              onPointerDown={stopOnly}
              onMouseDown={stopOnly}
              onFocus={() => setMode("replace")}
              onChange={(e) => {
                setMode("replace");
                setReplaceId(e.target.value);
              }}
            >
              {loops.map((loop) => (
                <option key={loop.id} value={loop.id}>
                  {loop.name}
                </option>
              ))}
            </select>
          </label>

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
    container
  );
}
