import type { Folder } from "../persistence/folderStore";
import { UNFILED_GROUP } from "../persistence/folderStore";
import type { SavedVideo } from "../persistence/loopStore";

export type VideoGroup = {
  // Folder id, or UNFILED_GROUP. Also the collapse-state key.
  key: string;
  folder: Folder | null;
  videos: SavedVideo[];
};

// Folders in their given order (empty ones included, so a fresh folder is
// visible and can be filed into), then Unfiled — only when it has videos. A
// video whose folderId names no existing folder (legacy, or deleted on
// another device) counts as Unfiled, so it can never be hidden. Video order
// within each group is preserved.
export function groupVideos(
  videos: SavedVideo[],
  folders: Folder[]
): VideoGroup[] {
  const byId = new Map<string, VideoGroup>(
    folders.map((folder) => [folder.id, { key: folder.id, folder, videos: [] }])
  );
  const unfiled: VideoGroup = { key: UNFILED_GROUP, folder: null, videos: [] };
  for (const video of videos) {
    const group = video.folderId != null ? byId.get(video.folderId) : undefined;
    (group ?? unfiled).videos.push(video);
  }
  const groups = [...byId.values()];
  if (unfiled.videos.length > 0) groups.push(unfiled);
  return groups;
}
