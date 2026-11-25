import { describe, expect, it } from "vitest";
import { groupVideos, searchGroups, videoMatches } from "./groupVideos";
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

describe("searchGroups", () => {
  const titled = (videoId: string, title: string | undefined, folderId?: string) => ({
    ...v(videoId, folderId),
    title
  });
  const groups = () =>
    groupVideos(
      [
        titled("a", "Caprice 24", "f1"),
        titled("b", "La Campanella", "f1"),
        titled("c", "Giant Steps", "f2"),
        titled("xyzId", undefined)
      ],
      folders
    );

  it("matches titles case-insensitively, keeping only matching videos", () => {
    const result = searchGroups(groups(), "  cAPRICE ");
    expect(result.map((g) => [g.key, g.nameOnly, g.videos.map((x) => x.videoId)])).toEqual([
      ["f1", false, ["a"]]
    ]);
  });

  it("falls back to the videoId for untitled videos", () => {
    const result = searchGroups(groups(), "XYZ");
    expect(result.map((g) => [g.key, g.videos.map((x) => x.videoId)])).toEqual([
      ["unfiled", ["xyzId"]]
    ]);
  });

  it("shows a name-matching folder with no matching videos as nameOnly, holding all its videos", () => {
    const result = searchGroups(groups(), "jaz");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "f2", nameOnly: true });
    expect(result[0]!.videos.map((x) => x.videoId)).toEqual(["c"]);
  });

  it("a name-matching folder with matching videos keeps only those", () => {
    // "pa" matches folder "Paganini" and video "La Campanella", not "Caprice 24".
    const result = searchGroups(groups(), "pa");
    expect(result.map((g) => [g.key, g.nameOnly, g.videos.map((x) => x.videoId)])).toEqual([
      ["f1", false, ["b"]]
    ]);
  });

  it("never matches the Unfiled label", () => {
    expect(searchGroups(groups(), "unfiled")).toEqual([]);
  });
});

describe("videoMatches", () => {
  it("is a case-insensitive substring on title", () => {
    expect(videoMatches({ ...v("id"), title: "Giant Steps" }, "ANT st")).toBe(true);
    expect(videoMatches({ ...v("id"), title: "Giant Steps" }, "caprice")).toBe(false);
  });
});
