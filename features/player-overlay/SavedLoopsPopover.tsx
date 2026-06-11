import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import type { SavedLoop } from "../persistence/loopStore";

type Props = {
  loops: SavedLoop[];
  selectedId: string | null;
  dirty: boolean;
  // Portaled out of YouTube's progress bar so its mouse events don't bubble
  // into the scrubber (preview/seek). Positioned above this anchor.
  container: HTMLElement | null;
  anchorRef: RefObject<HTMLElement | null>;
  onSaveAsNew: (name: string) => void;
  onUpdateSelected: () => void;
  onApply: (id: string) => void;
  onReplace: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

const POPOVER_WIDTH = 240;

const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

// Inputs need focus on click, so we must NOT preventDefault their mousedown
// (that cancels focus). Stop propagation only, to keep the event off YouTube's
// scrubber while still letting the field focus and receive keystrokes.
const stopOnly = (event: MouseEvent | PointerEvent) => {
  event.stopPropagation();
};

export function SavedLoopsPopover({
  loops,
  selectedId,
  dirty,
  container,
  anchorRef,
  onSaveAsNew,
  onUpdateSelected,
  onApply,
  onReplace,
  onRename,
  onDelete
}: Props) {
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  // Anchor the popover's bottom-right just above the toggle button. Fixed
  // positioning relative to the viewport (the player chrome doesn't scroll).
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (anchor == null) return;
    const rect = anchor.getBoundingClientRect();
    setPos({
      left: Math.max(8, rect.right - POPOVER_WIDTH),
      bottom: window.innerHeight - rect.top + 10
    });
  }, [anchorRef, loops.length, dirty]);

  const selected = loops.find((l) => l.id === selectedId) ?? null;

  const commitNew = () => {
    const name = newName.trim();
    if (name === "") return;
    onSaveAsNew(name);
    setNewName("");
  };

  const commitRename = (id: string) => {
    const name = renameText.trim();
    if (name !== "") onRename(id, name);
    setRenamingId(null);
  };

  // Latest values for the native key guard below (its listener is bound once).
  const newNameRef = useRef(newName);
  newNameRef.current = newName;
  const renameTextRef = useRef(renameText);
  renameTextRef.current = renameText;
  const renamingIdRef = useRef(renamingId);
  renamingIdRef.current = renamingId;

  // YouTube (and our own loop shortcuts) listen for keys in the capture phase
  // on document/body/player, which run before React's bubble-phase handlers —
  // so a typed key fires a video shortcut before we can stop it. Guard from
  // `window` (above document) in the capture phase: for our inputs, stop
  // propagation so no downstream shortcut handler sees the key. We don't
  // preventDefault, so the character still types and onChange still fires.
  // Enter/Escape are handled here too, since this guard also blocks React's
  // own onKeyDown for these inputs.
  useEffect(() => {
    const submit = (isRename: boolean) => {
      if (isRename && renamingIdRef.current != null) {
        const name = renameTextRef.current.trim();
        if (name !== "") onRename(renamingIdRef.current, name);
        setRenamingId(null);
        return;
      }
      const name = newNameRef.current.trim();
      if (name !== "") {
        onSaveAsNew(name);
        setNewName("");
      }
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.classList.contains("you-loop-loops-input")
      ) {
        return;
      }
      event.stopPropagation();
      if (event.type !== "keydown") return;

      const isRename = target.dataset.loopsField === "rename";
      if (event.key === "Enter") {
        event.preventDefault();
        submit(isRename);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (isRename) setRenamingId(null);
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
  }, [onRename, onSaveAsNew]);

  // No player root yet: nothing to portal into. `pos` fills in on the first
  // layout effect; until then the popover renders hidden to avoid a flash at
  // the wrong spot.
  if (container == null) return null;

  return createPortal(
    <div
      className="you-loop-loops-popover"
      role="dialog"
      aria-label="Saved loops"
      style={{
        left: pos?.left ?? 0,
        bottom: pos?.bottom ?? 0,
        visibility: pos == null ? "hidden" : "visible"
      }}
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={swallow}
    >
      <div className="you-loop-loops-new">
        <input
          className="you-loop-loops-input"
          data-loops-field="new"
          type="text"
          placeholder="Name this loop"
          value={newName}
          onPointerDown={stopOnly}
          onMouseDown={stopOnly}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="button"
          className="you-loop-loops-save"
          disabled={newName.trim() === ""}
          onClick={(e) => {
            swallow(e);
            commitNew();
          }}
        >
          Save as new
        </button>
      </div>

      {selected && dirty && (
        <button
          type="button"
          className="you-loop-loops-update"
          onClick={(e) => {
            swallow(e);
            onUpdateSelected();
          }}
        >
          Update “{selected.name}”
        </button>
      )}

      <ul className="you-loop-loops-list">
        {loops.length === 0 && (
          <li className="you-loop-loops-empty">No saved loops yet.</li>
        )}
        {loops.map((loop) => (
          <li
            key={loop.id}
            className="you-loop-loops-row"
            data-selected={loop.id === selectedId}
          >
            {renamingId === loop.id ? (
              <input
                className="you-loop-loops-input"
                data-loops-field="rename"
                type="text"
                autoFocus
                value={renameText}
                onPointerDown={stopOnly}
                onMouseDown={stopOnly}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => commitRename(loop.id)}
              />
            ) : (
              <button
                type="button"
                className="you-loop-loops-name"
                onClick={(e) => {
                  swallow(e);
                  onApply(loop.id);
                }}
              >
                {loop.name}
                {loop.id === selectedId && dirty && (
                  <span className="you-loop-loops-dirty" aria-hidden="true" />
                )}
              </button>
            )}

            <span className="you-loop-loops-actions">
              <button
                type="button"
                aria-label={`Replace ${loop.name} with the current loop`}
                title="Replace with current"
                onClick={(e) => {
                  swallow(e);
                  onReplace(loop.id);
                }}
              >
                ⤓
              </button>
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
    </div>,
    container
  );
}
