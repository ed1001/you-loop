import { describe, expect, it } from "vitest";
import { groupVideos } from "./groupVideos";
import type { SavedVideo } from "../persistence/loopStore";

const v = (videoId: string, folderId?: string): SavedVideo => ({
  videoId,
  count: 1,
  addedAt: 0,
  ...(folderId != null ? { folderId } : {})
});
const folders = [
  { id: "f1", name: "Paganini", createdAt: 1 },
  { id: "f2", name: "Jazz", createdAt: 2 }
];

describe("groupVideos", () => {
  it("groups by folder in folder order, Unfiled last, keeping video order", () => {
    const groups = groupVideos(
      [v("a", "f2"), v("b"), v("c", "f1"), v("d", "f2")],
      folders
    );
    expect(groups.map((g) => [g.key, g.videos.map((x) => x.videoId)])).toEqual([
      ["f1", ["c"]],
      ["f2", ["a", "d"]],
      ["unfiled", ["b"]]
    ]);
  });

  it("keeps empty folders and omits an empty Unfiled group", () => {
    const groups = groupVideos([v("a", "f1")], folders);
    expect(groups.map((g) => g.key)).toEqual(["f1", "f2"]);
  });

  it("treats a dangling folderId as Unfiled", () => {
    const groups = groupVideos([v("a", "gone")], folders);
    expect(groups.at(-1)).toMatchObject({ key: "unfiled", folder: null });
    expect(groups.at(-1)!.videos.map((x) => x.videoId)).toEqual(["a"]);
  });
});
