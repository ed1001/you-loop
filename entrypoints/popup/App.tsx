import { useEffect, useState } from "react";
import {
  listEntries,
  removeVideo,
  type SavedVideo,
  type SyncArea
} from "../../features/persistence/loopStore";
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

export function App({
  area,
  openTab = (url) => void browser.tabs.create({ url }),
  closeWindow = () => window.close()
}: Props) {
  const [enabled, setEnabledState] = useState(true);
  const [videos, setVideos] = useState<SavedVideo[]>([]);

  useEffect(() => {
    void getEnabled(area).then(setEnabledState);
    void listEntries(area ? { sync: area, local: area } : undefined).then(setVideos);
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
    void removeVideo(videoId, area ? { sync: area, local: area } : undefined);
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
      <p className="popup-label">Saved videos</p>
      <div className="popup-list">
        <VideoList
          videos={videos}
          onOpenVideo={(id) => void handleOpen(id)}
          onDeleteVideo={handleDelete}
        />
      </div>
    </div>
  );
}
