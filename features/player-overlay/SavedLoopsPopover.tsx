import { useLayoutEffect, useState } from "react";
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
          type="text"
          placeholder="Name this loop"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitNew();
            }
          }}
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
                type="text"
                autoFocus
                value={renameText}
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
