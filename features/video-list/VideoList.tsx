import { useState } from "react";
import type { MouseEvent } from "react";
import type { SavedVideo } from "../persistence/loopStore";

type Props = {
  videos: SavedVideo[];
  // Highlighted as "Playing" and not a navigation target (modal usage).
  currentVideoId?: string | null;
  onOpenVideo: (videoId: string) => void;
  // When provided, each row gets a delete button with a two-stage inline
  // confirm (✕ → "Delete?"). Popup usage.
  onDeleteVideo?: (videoId: string) => void;
};

// Inside the player overlay, clicks must not reach YouTube's own handlers.
const swallow = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function VideoList({
  videos,
  currentVideoId = null,
  onOpenVideo,
  onDeleteVideo
}: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (videos.length === 0) {
    return (
      <p className="you-loop-lm-empty">
        No saved videos yet. Videos with saved loops appear here.
      </p>
    );
  }

  return (
    <ul className="you-loop-lm-vlist">
      {videos.map((video) => {
        const isCurrent = video.videoId === currentVideoId;
        const label = video.title ?? video.videoId;
        const confirming = confirmingId === video.videoId;
        return (
          <li
            key={video.videoId}
            className="you-loop-lm-vrow"
            data-current={isCurrent}
            onMouseLeave={() => {
              if (confirming) setConfirmingId(null);
            }}
          >
            <button
              type="button"
              className="you-loop-lm-vopen"
              disabled={isCurrent}
              title={label}
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
            {onDeleteVideo != null && (
              <button
                type="button"
                className="you-loop-lm-vdel"
                data-confirming={confirming}
                aria-label={
                  confirming ? `Confirm delete ${label}` : `Delete ${label}`
                }
                onClick={(e) => {
                  swallow(e);
                  if (confirming) {
                    setConfirmingId(null);
                    onDeleteVideo(video.videoId);
                  } else {
                    setConfirmingId(video.videoId);
                  }
                }}
              >
                {confirming ? "Delete?" : "✕"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
