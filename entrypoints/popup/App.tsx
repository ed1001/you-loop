import { useEffect, useState } from "react";
import {
  listEntries,
  removeVideo,
  setVideoFolder,
  type SavedVideo,
  type SyncArea
} from "../../features/persistence/loopStore";
import {
  createFolder,
  deleteFolder,
  getCollapsedGroups,
  listFolders,
  renameFolder,
  setCollapsedGroups,
  type Folder
} from "../../features/persistence/folderStore";
import {
  getEnabled,
  setEnabled,
  requestLaunch
} from "../../features/persistence/settingsStore";
import { VideoList } from "../../features/video-list/VideoList";
import { VIDEO_LIST_STYLES } from "../../features/video-list/videoList.styles";
import { EtudeWordmark } from "../../features/player-overlay/EtudeWordmark";

type Props = {
  // Test seams; production uses the real extension APIs.
  area?: SyncArea;
  openTab?: (url: string) => void;
  closeWindow?: () => void;
};

const FOLDER_NAME_MAX_LENGTH = 40;

export function App({
  area,
  openTab = (url) => void browser.tabs.create({ url }),
  closeWindow = () => window.close()
}: Props) {
  const storage = area ? { sync: area, local: area } : undefined;
  const [enabled, setEnabledState] = useState(true);
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  // Inline "new folder" field. `fileVideoId` is set when it was opened from a
  // video's move menu: the new folder then receives that video.
  const [creating, setCreating] = useState<{ fileVideoId: string | null } | null>(
    null
  );
  const [newName, setNewName] = useState("");

  useEffect(() => {
    void getEnabled(area).then(setEnabledState);
    void listEntries(storage).then(setVideos);
    void listFolders(storage).then(setFolders);
    void getCollapsedGroups(area).then(setCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const toggle = () => {
    const next = !enabled;
    setEnabledState(next);
    void setEnabled(next, area);
  };

  // Write the one-shot handoff before opening: the content script in the new
  // tab reads it and starts with the loop panel enabled.
  const handleOpen = async (videoId: string) => {
    await requestLaunch(videoId, area);
    openTab(`https://www.youtube.com/watch?v=${videoId}`);
    closeWindow();
  };

  const handleDelete = (videoId: string) => {
    setVideos((prev) => prev.filter((v) => v.videoId !== videoId));
    void removeVideo(videoId, storage);
  };

  const moveVideo = (videoId: string, folderId: string | null) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.videoId !== videoId) return v;
        const { folderId: _old, ...rest } = v;
        return folderId == null ? rest : { ...rest, folderId };
      })
    );
    void setVideoFolder(videoId, folderId, storage);
  };

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      void setCollapsedGroups(next, area);
      return next;
    });
  };

  const startCreate = (fileVideoId: string | null) => {
    setNewName("");
    setCreating({ fileVideoId });
  };

  const commitCreate = async () => {
    const name = newName.trim();
    const pending = creating;
    setCreating(null);
    if (name === "" || pending == null) return;
    const folder = await createFolder(name, storage);
    setFolders((prev) => [...prev, folder]);
    if (pending.fileVideoId != null) moveVideo(pending.fileVideoId, folder.id);
  };

  const handleRename = (id: string, name: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    void renameFolder(id, name, storage);
  };

  const handleDeleteFolder = (id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setVideos((prev) =>
      prev.map((v) => {
        if (v.folderId !== id) return v;
        const { folderId: _old, ...rest } = v;
        return rest;
      })
    );
    void deleteFolder(id, storage);
  };

  return (
    <div className="popup">
      <style>{VIDEO_LIST_STYLES}</style>
      <header className="popup-head">
        <span className="popup-wordmark">
          <EtudeWordmark />
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? "Turn Étude off" : "Turn Étude on"}
          className="popup-switch"
          data-on={enabled}
          onClick={toggle}
        />
      </header>
      <div className="popup-labelrow">
        <p className="popup-label">Saved videos</p>
        {videos.length > 0 && (
          <button
            type="button"
            className="popup-newfolder"
            onClick={() => startCreate(null)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M12 10v6M9 13h6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            New folder
          </button>
        )}
      </div>
      {creating != null && (
        <div className="popup-create">
          <input
            className="popup-create-input"
            aria-label="New folder name"
            placeholder="Folder name"
            autoFocus
            maxLength={FOLDER_NAME_MAX_LENGTH}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitCreate();
              if (e.key === "Escape") setCreating(null);
            }}
          />
          <button
            type="button"
            className="popup-create-ok"
            disabled={newName.trim() === ""}
            onClick={() => void commitCreate()}
          >
            Create
          </button>
          <button
            type="button"
            className="popup-create-cancel"
            onClick={() => setCreating(null)}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="popup-list">
        <VideoList
          videos={videos}
          onOpenVideo={(id) => void handleOpen(id)}
          onDeleteVideo={handleDelete}
          folderControls={{
            folders,
            collapsed,
            onToggleGroup: toggleGroup,
            onMoveVideo: moveVideo,
            onNewFolderFor: (videoId) => startCreate(videoId),
            onRenameFolder: handleRename,
            onDeleteFolder: handleDeleteFolder
          }}
        />
      </div>
    </div>
  );
}
