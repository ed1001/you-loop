import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { LoopSegment } from "../playback/types";
import type { SavedLoop, SavedVideo } from "../persistence/loopStore";
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
  // The cross-video index for the "Saved videos" tab; includes the current
  // video (flagged via currentVideoId so its row reads "Playing").
  savedVideos: SavedVideo[];
  currentVideoId: string | null;
  onClose: () => void;
  onSaveAsNew: (name: string) => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenVideo: (videoId: string) => void;
};

type Tab = "video" | "library";

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
  currentSegment,
  dirty,
  savedVideos,
  currentVideoId,
  onClose,
  onSaveAsNew,
  onApply,
  onDelete,
  onOpenVideo,
}: Props) {
  const [newName, setNewName] = useState("");
  const [tab, setTab] = useState<Tab>("video");
  const listRef = useRef<HTMLUListElement | null>(null);
  const selectedRowRef = useRef<HTMLLIElement | null>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const { mounted, closing } = useModalPresence(open, EXIT_MS);

  // Bring the currently-selected loop into view each time the modal opens, so
  // it's visible even when the list overflows.
  useEffect(() => {
    if (!open || !mounted || tab !== "video") return;
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, tab]);

  // Fade whichever edge has clipped rows beyond it (content above when scrolled
  // down, content below when not at the end), as an obvious "more here" cue
  // without dimming a fully-visible first/last row.
  const updateFade = () => {
    const el = listRef.current;
    if (el == null) return;
    setFadeTop(el.scrollTop > 1);
    setFadeBottom(el.scrollHeight - el.clientHeight - el.scrollTop > 1);
  };

  // Re-measure when the modal opens, the tab changes, or the list contents do.
  useEffect(() => {
    updateFade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, open, tab, loops.length]);

  // Seed the save form and reset to the per-video tab each time it opens.
  useEffect(() => {
    if (!open) return;
    setNewName("");
    setTab("video");
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

  const canSave = newName.trim() !== "" && dirty;

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
            {tab === "video"
              ? `Current selection · ${formatRange(currentSegment)}`
              : `${savedVideos.length} ${savedVideos.length === 1 ? "video" : "videos"} with saved loops`}
          </p>
        </header>

        <nav className="you-loop-lm-tabs" role="tablist" aria-label="Saved loops view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "video"}
            className="you-loop-lm-tab"
            data-active={tab === "video"}
            onClick={(e) => {
              swallow(e);
              setTab("video");
            }}
          >
            This video
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "library"}
            className="you-loop-lm-tab"
            data-active={tab === "library"}
            onClick={(e) => {
              swallow(e);
              setTab("library");
            }}
          >
            Saved videos
          </button>
        </nav>

        {tab === "video" && (
        <>
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
            {loops.map((loop) => (
              <li
                key={loop.id}
                ref={loop.id === selectedId ? selectedRowRef : undefined}
                className="you-loop-lm-row"
                data-selected={loop.id === selectedId}
              >
                <button
                  type="button"
                  className="you-loop-lm-apply"
                  onClick={(e) => {
                    swallow(e);
                    onApply(loop.id);
                  }}
                >
                  <span className="you-loop-lm-name-text">{loop.name}</span>
                  <span className="you-loop-lm-range">
                    {formatRange(loop.main)}
                  </span>
                </button>

                <span className="you-loop-lm-actions">
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

        <section className="you-loop-lm-save" data-disabled={!dirty}>
          <h3 className="you-loop-lm-label">Save current loop</h3>

          <input
            className="you-loop-loops-input you-loop-lm-name"
            data-loops-field="new"
            type="text"
            placeholder={dirty ? "name this loop" : "current loop already saved"}
            maxLength={NAME_MAX_LENGTH}
            value={newName}
            disabled={!dirty}
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
        </>
        )}

        {tab === "library" && (
        <section className="you-loop-lm-videos-wrap">
          {savedVideos.length === 0 ? (
            <p className="you-loop-lm-empty">
              No saved videos yet. Loops you save are listed here, by video.
            </p>
          ) : (
            <ul className="you-loop-lm-vlist">
              {savedVideos.map((video) => {
                const isCurrent = video.videoId === currentVideoId;
                const label = video.title ?? video.videoId;
                return (
                  <li key={video.videoId} className="you-loop-lm-vrow" data-current={isCurrent}>
                    <button
                      type="button"
                      className="you-loop-lm-vopen"
                      disabled={isCurrent}
                      title={isCurrent ? "Now playing" : `Open ${label}`}
                      aria-label={isCurrent ? `${label} (now playing)` : `Open ${label}`}
                      onClick={(e) => {
                        swallow(e);
                        onOpenVideo(video.videoId);
                      }}
                    >
                      <span className="you-loop-lm-vname">{label}</span>
                      <span className="you-loop-lm-vmeta">
                        {isCurrent && <span className="you-loop-lm-vnow">Playing</span>}
                        <span className="you-loop-lm-vcount">
                          {video.count} {video.count === 1 ? "loop" : "loops"}
                        </span>
                        {!isCurrent && (
                          <svg
                            className="you-loop-lm-vgo"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path
                              d="M9 6l6 6-6 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )}
      </div>
    </div>,
    container,
  );
}
