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

// Search is case-insensitive substring on the shown label: title, or the
// videoId for untitled videos.
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function videoMatches(video: SavedVideo, query: string): boolean {
  return (video.title ?? video.videoId).toLowerCase().includes(normalizeQuery(query));
}

export type SearchGroup = VideoGroup & {
  // Shown only because its folder name matched: it holds all its videos and
  // starts collapsed, so the user can open it to browse.
  nameOnly: boolean;
};

// Groups while searching. A group keeps only its matching videos; a folder
// whose name matches is shown even with none (as `nameOnly`). Groups with
// neither are dropped. Unfiled is not a folder, so its label never matches.
export function searchGroups(groups: VideoGroup[], query: string): SearchGroup[] {
  const q = normalizeQuery(query);
  const result: SearchGroup[] = [];
  for (const group of groups) {
    const videos = group.videos.filter((v) => videoMatches(v, q));
    if (videos.length > 0) {
      result.push({ ...group, videos, nameOnly: false });
    } else if (group.folder != null && group.folder.name.toLowerCase().includes(q)) {
      result.push({ ...group, nameOnly: true });
    }
  }
  return result;
}
