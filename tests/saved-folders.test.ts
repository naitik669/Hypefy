import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mergeSaved, savedPost, savedShot, foundItem, itemKey, type SavedItem } from "@/lib/saved";
import { cleanFolderName, folderFill, nextFolderColor, toFolder, FOLDER_COLORS } from "@/lib/folders";
import { FolderArt } from "@/components/saved/FolderArt";

const item = (kind: "post" | "shot", id: string, savedAt: string): SavedItem => ({
  id,
  kind,
  thumb: null,
  video: null,
  caption: null,
  savedAt,
  multi: false,
});

describe("savedPost / savedShot", () => {
  it("reads a saved post, its first photo, and whether it has more", () => {
    expect(
      savedPost({ created_at: "2026-09-10T00:00:00Z", posts: { id: "p", image_urls: ["a.jpg", "b.jpg"], image_url: "x.jpg", caption: "hi" } })
    ).toEqual({ id: "p", kind: "post", thumb: "a.jpg", video: null, caption: "hi", savedAt: "2026-09-10T00:00:00Z", multi: true });
    expect(savedPost({ created_at: "t", posts: [{ id: "p", image_urls: null, image_url: "x.jpg", caption: null }] })?.thumb).toBe("x.jpg");
    expect(savedPost({ created_at: "t", posts: null })).toBeNull();
  });

  it("never puts a Shot's video where an image goes", () => {
    const s = savedShot({ created_at: "t", shots: { id: "s", poster_url: null, media_url: "v.mp4", caption: "c" } });
    expect(s).toMatchObject({ kind: "shot", thumb: null, video: "v.mp4" });
  });

  it("reads a search result", () => {
    expect(foundItem({ kind: "shot", id: "s", thumb: null, video: "v.mp4", caption: null, saved_at: "t" })).toMatchObject({
      kind: "shot",
      savedAt: "t",
    });
    expect(itemKey({ kind: "post", id: "1" })).not.toBe(itemKey({ kind: "shot", id: "1" }));
  });
});

describe("mergeSaved", () => {
  const posts = [item("post", "p1", "2026-09-10"), item("post", "p2", "2026-09-06")];
  const shots = [item("shot", "s1", "2026-09-09"), item("shot", "s2", "2026-09-08"), item("shot", "s3", "2026-09-07")];

  it("interleaves by when they were saved once both lists are complete", () => {
    expect(mergeSaved(posts, shots, "newest", { posts: true, shots: true }).map((i) => i.id)).toEqual(["p1", "s1", "s2", "s3", "p2"]);
  });

  it("stops where a list with more to come has reached, so nothing jumps later", () => {
    // Posts loaded down to the 6th with more to come: everything from the
    // 6th up is settled, so all of it shows.
    expect(mergeSaved(posts, shots, "newest", { posts: false, shots: true }).map((i) => i.id)).toEqual(["p1", "s1", "s2", "s3", "p2"]);
    // Shots loaded down to the 7th with more to come: an unloaded Shot could
    // belong above p2 (the 6th), so p2 waits.
    expect(mergeSaved(posts, shots, "newest", { posts: true, shots: false }).map((i) => i.id)).toEqual(["p1", "s1", "s2", "s3"]);
  });

  it("runs the other way for oldest first", () => {
    const up = (l: SavedItem[]) => [...l].reverse();
    expect(mergeSaved(up(posts), up(shots), "oldest", { posts: true, shots: true }).map((i) => i.id)).toEqual(["p2", "s3", "s2", "s1", "p1"]);
    // Posts have reached the 10th, Shots only the 9th: the nearer end wins,
    // so p1 (the 10th) waits for the Shots to catch up.
    expect(mergeSaved(up(posts), up(shots), "oldest", { posts: false, shots: false }).map((i) => i.id)).toEqual(["p2", "s3", "s2", "s1"]);
  });
});

describe("folders", () => {
  it("reads get_folders rows, keeping only four covers and a known colour", () => {
    const f = toFolder({
      id: "f",
      name: "Food",
      emoji: "🍜",
      color: "neon",
      position: 2,
      cover_url: null,
      item_count: 7,
      covers: [{ kind: "post", thumb: "a" }, { kind: "shot", thumb: null, video: "v" }, {}, {}, {}],
    });
    expect(f.covers).toHaveLength(4);
    expect(f.covers[1]).toEqual({ kind: "shot", thumb: null, video: "v" });
    expect(FOLDER_COLORS.some((c) => c.key === f.color)).toBe(true);
    expect(f.itemCount).toBe(7);
  });

  it("gives an unset colour the same pick every time, from the folder", () => {
    expect(folderFill(null, "abc").key).toBe(folderFill(null, "abc").key);
    expect(folderFill("teal").key).toBe("teal");
    expect(nextFolderColor(0)).not.toBe(nextFolderColor(1));
  });

  it("takes names of 1 to 40 characters, tidied", () => {
    expect(cleanFolderName("  late   night  ")).toBe("late night");
    expect(cleanFolderName("   ")).toBeNull();
    expect(cleanFolderName("x".repeat(41))).toBeNull();
  });
});

describe("FolderArt", () => {
  const base = { id: "f", emoji: "🎧", color: "plum", coverUrl: null };

  it("shows the emoji on an empty folder", () => {
    const html = renderToStaticMarkup(createElement(FolderArt, { folder: { ...base, covers: [] } }));
    expect(html).toContain("🎧");
    expect(html).not.toContain("<img");
  });

  it("sets up to four pictures into the tile, and a chosen cover first", () => {
    const covers = ["a", "b", "c", "d", "e"].map((t) => ({ kind: "post" as const, thumb: `${t}.jpg`, video: null }));
    const four = renderToStaticMarkup(createElement(FolderArt, { folder: { ...base, covers } }));
    expect(four.match(/<img/g)).toHaveLength(4);
    const chosen = renderToStaticMarkup(createElement(FolderArt, { folder: { ...base, coverUrl: "z.jpg", covers } }));
    expect(chosen.indexOf("z.jpg")).toBeLessThan(chosen.indexOf("a.jpg"));
  });

  it("gives three pictures one tall cell", () => {
    const covers = ["a", "b", "c"].map((t) => ({ kind: "post" as const, thumb: `${t}.jpg`, video: null }));
    expect(renderToStaticMarkup(createElement(FolderArt, { folder: { ...base, covers } }))).toContain("span 2");
  });
});
