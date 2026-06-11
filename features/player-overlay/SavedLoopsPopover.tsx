import { useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { SavedLoop } from "../persistence/loopStore";

type Props = {
  loops: SavedLoop[];
  selectedId: string | null;
  dirty: boolean;
  onSaveAsNew: (name: string) => void;
  onUpdateSelected: () => void;
  onApply: (id: string) => void;
  onReplace: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

const swallow = (event: MouseEvent | PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function SavedLoopsPopover({
  loops,
  selectedId,
  dirty,
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

  return (
    <div
      className="you-loop-loops-popover"
      role="dialog"
      aria-label="Saved loops"
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
    </div>
  );
}
