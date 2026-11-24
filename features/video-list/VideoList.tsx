import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import type { Folder } from "../persistence/folderStore";
import type { SavedVideo } from "../persistence/loopStore";
import { groupVideos, type VideoGroup } from "./groupVideos";

// Folder features (popup only). With no folders the list renders flat, exactly
// as before folders existed.
export type FolderControls = {
  folders: Folder[];
  // Group keys (folder id or "unfiled") currently collapsed.
  collapsed: string[];
  onToggleGroup: (key: string) => void;
  onMoveVideo: (videoId: string, folderId: string | null) => void;
  // "New folder…" from a video's move menu: create a folder and file it there.
  onNewFolderFor: (videoId: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
};

type Props = {
  videos: SavedVideo[];
  // Highlighted as "Playing" and not a navigation target (modal usage).
  currentVideoId?: string | null;
  onOpenVideo: (videoId: string) => void;
  // When provided, each row gets a delete button with a two-stage inline
  // confirm (✕ → "Delete?"). Popup usage.
  onDeleteVideo?: (videoId: string) => void;
  folderControls?: FolderControls;
};

const FOLDER_NAME_MAX_LENGTH = 40;

// Inside the player overlay, clicks must not reach YouTube's own handlers.
const swallow = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const FolderIcon = (
  <svg
    className="you-loop-lm-ficon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const MoveIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M10 13h6M13.5 10.5L16 13l-2.5 2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function VideoList({
  videos,
  currentVideoId = null,
  onOpenVideo,
  onDeleteVideo,
  folderControls
}: Props) {
  // One armed delete at a time across videos and folders: "v:<id>" / "f:<id>".
  const [armed, setArmed] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Close an open move menu on any outside press or Escape.
  useEffect(() => {
    if (menuFor == null) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".you-loop-lm-vmenu, .you-loop-lm-vmove") != null
      ) {
        return;
      }
      setMenuFor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  if (videos.length === 0 && (folderControls?.folders.length ?? 0) === 0) {
    return (
      <p className="you-loop-lm-empty">
        No saved videos yet. Videos with saved loops appear here.
      </p>
    );
  }

  const rowProps = {
    currentVideoId,
    onOpenVideo,
    onDeleteVideo,
    folderControls,
    armed,
    setArmed,
    menuFor,
    setMenuFor
  };

  if (folderControls == null || folderControls.folders.length === 0) {
    return (
      <ul className="you-loop-lm-vlist">
        {videos.map((video) => (
          <VideoRow key={video.videoId} video={video} {...rowProps} />
        ))}
      </ul>
    );
  }

  return (
    <div className="you-loop-lm-groups">
      {groupVideos(videos, folderControls.folders).map((group) => (
        <FolderGroup
          key={group.key}
          group={group}
          controls={folderControls}
          armed={armed}
          setArmed={setArmed}
        >
          {group.videos.length === 0 ? (
            <p className="you-loop-lm-gempty">
              Empty — use a video’s move button to file it here.
            </p>
          ) : (
            <ul className="you-loop-lm-vlist">
              {group.videos.map((video) => (
                <VideoRow key={video.videoId} video={video} {...rowProps} />
              ))}
            </ul>
          )}
        </FolderGroup>
      ))}
    </div>
  );
}

type GroupProps = {
  group: VideoGroup;
  controls: FolderControls;
  armed: string | null;
  setArmed: (value: string | null) => void;
  children: ReactNode;
};

function FolderGroup({ group, controls, armed, setArmed, children }: GroupProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const collapsed = controls.collapsed.includes(group.key);
  const name = group.folder?.name ?? "Unfiled";
  const armKey = `f:${group.key}`;
  const confirming = armed === armKey;
  const count = group.videos.length;

  const commitRename = () => {
    const trimmed = draft.trim();
    if (group.folder != null && trimmed !== "" && trimmed !== group.folder.name) {
      controls.onRenameFolder(group.folder.id, trimmed);
    }
    setRenaming(false);
  };

  return (
    <section
      className="you-loop-lm-group"
      data-collapsed={collapsed}
      data-unfiled={group.folder == null}
    >
      {renaming ? (
        <div className="you-loop-lm-ghead">
          <input
            className="you-loop-lm-finput"
            aria-label="Folder name"
            autoFocus
            maxLength={FOLDER_NAME_MAX_LENGTH}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        </div>
      ) : (
        <div
          className="you-loop-lm-ghead"
          onMouseLeave={() => {
            if (confirming) setArmed(null);
          }}
        >
          <button
            type="button"
            className="you-loop-lm-gtoggle"
            aria-expanded={!collapsed}
            aria-label={`${name}, ${count} ${count === 1 ? "video" : "videos"}`}
            onClick={() => controls.onToggleGroup(group.key)}
          >
            <svg
              className="you-loop-lm-gchev"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {FolderIcon}
            <span className="you-loop-lm-gname">{name}</span>
            <span className="you-loop-lm-gcount">{count}</span>
          </button>
          {group.folder != null && (
            <>
              <button
                type="button"
                className="you-loop-lm-gact"
                aria-label={`Rename ${name}`}
                title="Rename"
                onClick={() => {
                  setDraft(name);
                  setRenaming(true);
                  setArmed(null);
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
                className="you-loop-lm-gact you-loop-lm-gdel"
                data-confirming={confirming}
                aria-label={
                  confirming ? `Confirm delete folder ${name}` : `Delete folder ${name}`
                }
                title="Delete folder (its videos move to Unfiled)"
                onBlur={() => {
                  if (confirming) setArmed(null);
                }}
                onClick={() => {
                  if (confirming) {
                    setArmed(null);
                    controls.onDeleteFolder(group.folder!.id);
                  } else {
                    setArmed(armKey);
                  }
                }}
              >
                {confirming ? "Delete folder?" : "✕"}
              </button>
            </>
          )}
        </div>
      )}
      {!collapsed && children}
    </section>
  );
}

type RowProps = {
  video: SavedVideo;
  currentVideoId: string | null;
  onOpenVideo: (videoId: string) => void;
  onDeleteVideo?: (videoId: string) => void;
  folderControls?: FolderControls;
  armed: string | null;
  setArmed: (value: string | null) => void;
  menuFor: string | null;
  setMenuFor: (value: string | null) => void;
};

function VideoRow({
  video,
  currentVideoId,
  onOpenVideo,
  onDeleteVideo,
  folderControls,
  armed,
  setArmed,
  menuFor,
  setMenuFor
}: RowProps) {
  const isCurrent = video.videoId === currentVideoId;
  const label = video.title ?? video.videoId;
  const armKey = `v:${video.videoId}`;
  const confirming = armed === armKey;
  const menuOpen = menuFor === video.videoId;
  const disarm = () => {
    if (confirming) setArmed(null);
  };

  return (
    <li
      className="you-loop-lm-vrow"
      data-current={isCurrent}
      data-menu-open={menuOpen}
      onMouseLeave={disarm}
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
        <VideoMeta isCurrent={isCurrent} />
      </button>
      {(folderControls?.folders.length ?? 0) > 0 && (
        <MoveButton
          label={label}
          open={menuOpen}
          onClick={() => {
            setArmed(null);
            setMenuFor(menuOpen ? null : video.videoId);
          }}
        />
      )}
      {onDeleteVideo != null && (
        <DeleteVideoButton
          label={label}
          confirming={confirming}
          onArm={() => setArmed(armKey)}
          onDisarm={disarm}
          onConfirm={() => {
            setArmed(null);
            onDeleteVideo(video.videoId);
          }}
        />
      )}
      {menuOpen && folderControls != null && (
        <MoveMenu
          label={label}
          videoId={video.videoId}
          folderId={video.folderId}
          controls={folderControls}
          close={() => setMenuFor(null)}
        />
      )}
    </li>
  );
}

type MoveMenuProps = {
  label: string;
  videoId: string;
  folderId: string | undefined;
  controls: FolderControls;
  close: () => void;
};

function MoveMenu({ label, videoId, folderId, controls, close }: MoveMenuProps) {
  // A dangling folderId (folder deleted elsewhere) reads as Unfiled.
  const currentFolder = controls.folders.some((f) => f.id === folderId)
    ? folderId!
    : null;
  const targets: { id: string | null; name: string }[] = [
    ...controls.folders.map((f) => ({ id: f.id, name: f.name })),
    { id: null, name: "Unfiled" }
  ];
  return (
    <div className="you-loop-lm-vmenu" role="menu" aria-label={`Move ${label}`}>
      <p className="you-loop-lm-vmenu-kicker">Move to</p>
      {targets.map((target) => (
        <button
          key={target.id ?? "unfiled"}
          type="button"
          role="menuitemradio"
          aria-checked={target.id === currentFolder}
          className="you-loop-lm-vmenu-item"
          data-current={target.id === currentFolder}
          onClick={(e) => {
            swallow(e);
            close();
            if (target.id !== currentFolder) controls.onMoveVideo(videoId, target.id);
          }}
        >
          {target.name}
        </button>
      ))}
      <hr className="you-loop-lm-vmenu-sep" />
      <button
        type="button"
        role="menuitem"
        className="you-loop-lm-vmenu-item"
        onClick={(e) => {
          swallow(e);
          close();
          controls.onNewFolderFor(videoId);
        }}
      >
        New folder…
      </button>
    </div>
  );
}

function VideoMeta({ isCurrent }: { isCurrent: boolean }) {
  return (
    <span className="you-loop-lm-vmeta">
      {isCurrent && <span className="you-loop-lm-vnow">Playing</span>}
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
  );
}

function MoveButton({
  label,
  open,
  onClick
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="you-loop-lm-vmove"
      data-open={open}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Move ${label} to folder`}
      title="Move to folder"
      onClick={(e) => {
        swallow(e);
        onClick();
      }}
    >
      {MoveIcon}
    </button>
  );
}

// Two-stage delete: ✕ arms, "Delete?" confirms.
function DeleteVideoButton({
  label,
  confirming,
  onArm,
  onDisarm,
  onConfirm
}: {
  label: string;
  confirming: boolean;
  onArm: () => void;
  onDisarm: () => void;
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      className="you-loop-lm-vdel"
      data-confirming={confirming}
      aria-label={confirming ? `Confirm delete ${label}` : `Delete ${label}`}
      onBlur={onDisarm}
      onClick={(e) => {
        swallow(e);
        if (confirming) onConfirm();
        else onArm();
      }}
    >
      {confirming ? "Delete?" : "✕"}
    </button>
  );
}
