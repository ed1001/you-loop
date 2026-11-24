import { describe, expect, it } from "vitest";
import { addLoop, keyFor, listEntries, setVideoFolder } from "./loopStore";
import {
  COLLAPSED_GROUPS_KEY,
  FOLDERS_KEY,
  createFolder,
  deleteFolder,
  getCollapsedGroups,
  listFolders,
  renameFolder,
  setCollapsedGroups
} from "./folderStore";
import { makeMemoryArea } from "./memoryArea.testutil";

const seg = (start: number, end: number) => ({ start, end });

function setup(initial: Record<string, unknown> = {}) {
  const area = makeMemoryArea(initial);
  return { area, storage: { sync: area, local: area } };
}

describe("folderStore", () => {
  it("creates folders in creation order and lists them", async () => {
    const { storage } = setup();
    const a = await createFolder("Paganini", storage, 10);
    const b = await createFolder("Jazz", storage, 20);
    expect(await listFolders(storage)).toEqual([a, b]);
    expect(a.id).not.toBe(b.id);
  });

  it("renames a folder; unknown id is a no-op", async () => {
    const { storage } = setup();
    const a = await createFolder("Paganini", storage, 10);
    await renameFolder(a.id, "Caprices", storage);
    await renameFolder("nope", "X", storage);
    expect((await listFolders(storage)).map((f) => f.name)).toEqual(["Caprices"]);
  });

  it("assigns and unassigns a video's folder", async () => {
    const { storage, area } = setup();
    await addLoop("vid1", "A", seg(1, 2), null, null, null, storage, 1);
    const f = await createFolder("Paganini", storage);
    await setVideoFolder("vid1", f.id, storage);
    expect((await listEntries(storage))[0].folderId).toBe(f.id);
    await setVideoFolder("vid1", null, storage);
    expect((await listEntries(storage))[0].folderId).toBeUndefined();
    expect(area.dump()[keyFor("vid1")]).not.toHaveProperty("folderId");
  });

  it("assigning a folder to an unknown video writes nothing", async () => {
    const { storage, area } = setup();
    await setVideoFolder("ghost", "f1", storage);
    expect(area.dump()).toEqual({});
  });

  it("deleting a folder unfiles its videos and keeps every video and loop", async () => {
    const { storage } = setup();
    await addLoop("vid1", "A", seg(1, 2), null, null, null, storage, 1);
    await addLoop("vid1", "B", seg(3, 4), null, null, null, storage, 1);
    await addLoop("vid2", "C", seg(5, 6), null, null, null, storage, 2);
    await addLoop("vid3", "D", seg(7, 8), null, null, null, storage, 3);
    const keep = await createFolder("Keep", storage, 1);
    const drop = await createFolder("Drop", storage, 2);
    await setVideoFolder("vid1", drop.id, storage);
    await setVideoFolder("vid2", drop.id, storage);
    await setVideoFolder("vid3", keep.id, storage);

    await deleteFolder(drop.id, storage);

    expect(await listFolders(storage)).toEqual([keep]);
    const videos = await listEntries(storage);
    expect(videos.map((v) => [v.videoId, v.count, v.folderId])).toEqual([
      ["vid3", 1, keep.id],
      ["vid2", 1, undefined],
      ["vid1", 2, undefined]
    ]);
  });

  it("legacy entries without folderId list with no folder", async () => {
    const { storage } = setup({
      [keyFor("old")]: {
        loops: [{ id: "l1", name: "A", main: seg(1, 2), zoom: null }],
        lastUsedId: "l1",
        addedAt: 5
      }
    });
    const [video] = await listEntries(storage);
    expect(video.videoId).toBe("old");
    expect(video.folderId).toBeUndefined();
  });

  it("ignores a corrupt folder list", async () => {
    const { storage } = setup({
      [FOLDERS_KEY]: [{ id: 1 }, null, { id: "ok", name: "Ok", createdAt: 1 }]
    });
    expect(await listFolders(storage)).toEqual([
      { id: "ok", name: "Ok", createdAt: 1 }
    ]);
  });

  it("falls back to local when the sync write fails", async () => {
    const sync = makeMemoryArea({}, { failSetsAfter: 0 });
    const local = makeMemoryArea();
    const f = await createFolder("Paganini", { sync, local });
    expect(local.dump()[FOLDERS_KEY]).toEqual([f]);
    expect(await listFolders({ sync, local })).toEqual([f]);
  });

  it("round-trips collapsed groups and defaults to none", async () => {
    const area = makeMemoryArea();
    expect(await getCollapsedGroups(area)).toEqual([]);
    await setCollapsedGroups(["f1", "unfiled"], area);
    expect(await getCollapsedGroups(area)).toEqual(["f1", "unfiled"]);
    area.data.set(COLLAPSED_GROUPS_KEY, "garbage");
    expect(await getCollapsedGroups(area)).toEqual([]);
  });
});
