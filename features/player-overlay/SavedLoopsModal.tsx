import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { LoopSegment } from "../playback/types";
import type { SavedLoop, SavedVideo } from "../persistence/loopStore";
import { useModalPresence } from "./useModalPresence";
import { VideoList } from "../video-list/VideoList";

// Must match the you-loop-help-sink duration so the card finishes its exit
// before it unmounts.
const EXIT_MS = 200;
// Loop names are short labels; keep them from overrunning the row.
const NAME_MAX_LENGTH = 40;
// Card height tween on tab switch; matches the pane crossfade's feel.
const HEIGHT_MS = 260;
// Outgoing pane fade; must match the you-loop-pane-out duration so the swap
// lands exactly as the old pane finishes fading.
const PANE_EXIT_MS = 180;

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
  // Two-phase tab switch: a pending tab means the current pane is fading out;
  // the content swaps (and the new pane fades in) once the exit completes. The
  // tab pill highlights the pending tab immediately so the click feels instant.
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Card height at the moment of a tab switch, captured before React swaps the
  // pane, so the height tween below knows where to animate from.
  const heightBeforeSwitch = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const selectedRowRef = useRef<HTMLLIElement | null>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const { mounted, closing } = useModalPresence(open, EXIT_MS);

  const activeTab = pendingTab ?? tab;

  const switchTab = (next: Tab) => {
    if (next === activeTab) return;
    // Re-targeting mid-exit just updates the destination; the running fade-out
    // finishes and the swap lands on the latest choice.
    setPendingTab(next);
  };

  // Once the outgoing pane has faded, swap the content. The height is captured
  // here (not at click time) so the tween starts from the still-current layout.
  useEffect(() => {
    if (pendingTab == null) return;
    const timer = window.setTimeout(() => {
      heightBeforeSwitch.current = cardRef.current?.offsetHeight ?? null;
      setTab(pendingTab);
      setPendingTab(null);
    }, PANE_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingTab]);

  // The card's height is content-driven (auto), so a tab switch would snap it.
  // FLIP-style tween: pin the pre-switch height, let the new pane render, then
  // transition to the new natural height and release back to auto.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const from = heightBeforeSwitch.current;
    heightBeforeSwitch.current = null;
    if (card == null || from == null) return;
    const to = card.offsetHeight;
    if (from === to) return;

    card.style.height = `${from}px`;
    card.style.overflow = "hidden";
    void card.offsetHeight; // commit the start height before transitioning
    card.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.32, 0.72, 0.25, 1)`;
    card.style.height = `${to}px`;

    // Timer (not transitionend) so the cleanup is immune to interrupted or
    // swallowed transition events.
    const timer = window.setTimeout(() => {
      card.style.height = "";
      card.style.overflow = "";
      card.style.transition = "";
    }, HEIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [tab]);

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
    setPendingTab(null);
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
        ref={cardRef}
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
            aria-selected={activeTab === "video"}
            className="you-loop-lm-tab"
            data-active={activeTab === "video"}
            onClick={(e) => {
              swallow(e);
              switchTab("video");
            }}
          >
            This video
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "library"}
            className="you-loop-lm-tab"
            data-active={activeTab === "library"}
            onClick={(e) => {
              swallow(e);
              switchTab("library");
            }}
          >
            Saved videos
          </button>
        </nav>

        {/* key remounts the pane on tab change so its enter animation replays:
            content crossfades and rises instead of snapping. */}
        {tab === "video" && (
        <div
          className="you-loop-lm-pane"
          key="video"
          data-leaving={pendingTab != null}
        >
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
                  title={`Apply “${loop.name}”`}
                  aria-label={`Apply ${loop.name}`}
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
            placeholder={dirty ? "Name this loop" : "Current loop already saved"}
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
        </div>
        )}

        {tab === "library" && (
        <div
          className="you-loop-lm-pane"
          key="library"
          data-leaving={pendingTab != null}
        >
        <section className="you-loop-lm-videos-wrap">
          <VideoList
            videos={savedVideos}
            currentVideoId={currentVideoId}
            onOpenVideo={onOpenVideo}
          />
        </section>
        </div>
        )}
      </div>
    </div>,
    container,
  );
}
