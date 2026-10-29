import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isVideoUrl } from "@/lib/video-mime";
import {
  SHOW_PHOTO_MS,
  SHOW_VIDEO_FALLBACK_MS,
  SHOW_VIDEO_MAX_MS,
  SHOW_VIDEO_MIN_MS,
  reapableObjectPath,
  showDurationMs,
  showMediaKind,
} from "@/lib/show-media";

/**
 * A Show is drawn with the element it actually is, and held for as long as
 * that thing lasts.
 *
 * Two bugs, exact mirrors of each other, both live since Shows shipped.
 * The viewer drew every media_url with an <img>, so a video Show was a
 * broken image — and the picker accepts video, the bucket stores 25 MB of
 * it, and "share a Shot to your Show" produces one every time. The grid
 * drew every tile as a <video>, so a photo Show — nearly all of them —
 * was a blank black square in its own author's list.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const viewer = read("src/components/shows/ShowViewer.tsx");
const grid = read("src/app/(app)/shows/page.tsx");

describe("telling a video from a photo by its url", () => {
  it("knows the formats the bucket takes", () => {
    for (const ext of ["mp4", "webm", "mov", "m4v", "qt"]) {
      expect(isVideoUrl(`https://x.supabase.co/a/b.${ext}`)).toBe(true);
    }
  });

  it("and the ones it does not", () => {
    for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "heic"]) {
      expect(isVideoUrl(`https://x.supabase.co/a/b.${ext}`)).toBe(false);
    }
  });

  it("whatever case it is written in", () => {
    expect(isVideoUrl("https://x/a.MP4")).toBe(true);
    expect(isVideoUrl("https://x/a.MoV")).toBe(true);
  });

  it("past a token or a fragment, which say nothing about the format", () => {
    expect(isVideoUrl("https://x/a.mp4?token=abc&t=2")).toBe(true);
    expect(isVideoUrl("https://x/a.mp4#t=10")).toBe(true);
    expect(isVideoUrl("https://x/a.jpg?token=abc")).toBe(false);
  });

  it("and is not fooled by a dot that is not an extension", () => {
    // The host has dots in it, and a path need not have an extension.
    expect(isVideoUrl("https://cdn.example.com/shows/abc")).toBe(false);
    expect(isVideoUrl("https://cdn.example.com/mp4/abc")).toBe(false);
  });

  it("nothing is not a video", () => {
    expect(isVideoUrl(null)).toBe(false);
    expect(isVideoUrl(undefined)).toBe(false);
    expect(isVideoUrl("")).toBe(false);
  });
});

describe("what to draw it with", () => {
  it("photo, video, or nothing at all", () => {
    expect(showMediaKind("https://x/a.jpg")).toBe("photo");
    expect(showMediaKind("https://x/a.mp4")).toBe("video");
    expect(showMediaKind(null)).toBe("none");
  });
});

describe("how long a Show holds the screen", () => {
  it("a photo gets the five seconds it always had", () => {
    expect(showDurationMs("https://x/a.jpg", null)).toBe(SHOW_PHOTO_MS);
    // Even if something hands it a number: a photo has no duration.
    expect(showDurationMs("https://x/a.jpg", 20)).toBe(SHOW_PHOTO_MS);
  });

  it("a video gets its own length", () => {
    // This is the fix. A twenty-second clip used to be cut off at five,
    // every time, with nothing in the bar to say there was more.
    expect(showDurationMs("https://x/a.mp4", 12)).toBe(12_000);
    expect(showDurationMs("https://x/a.mp4", 7.5)).toBe(7500);
  });

  it("but not longer than the cap, however long the file is", () => {
    expect(showDurationMs("https://x/a.mp4", 600)).toBe(SHOW_VIDEO_MAX_MS);
  });

  it("nor shorter than the floor, so a flash is still watchable", () => {
    expect(showDurationMs("https://x/a.mp4", 0.2)).toBe(SHOW_VIDEO_MIN_MS);
  });

  it("and a video that will not say falls back rather than breaking", () => {
    // duration is NaN until metadata lands and Infinity for a stream; on a
    // bad connection it may never arrive at all.
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, 0, -5]) {
      expect(showDurationMs("https://x/a.mp4", bad as number)).toBe(SHOW_VIDEO_FALLBACK_MS);
    }
  });

  it("the bar never stalls and never finishes instantly", () => {
    for (const secs of [null, 0, 0.01, 1, 9, 31, 1e9, NaN]) {
      const ms = showDurationMs("https://x/a.mp4", secs as number);
      expect(ms).toBeGreaterThanOrEqual(SHOW_VIDEO_MIN_MS);
      expect(ms).toBeLessThanOrEqual(SHOW_VIDEO_MAX_MS);
    }
  });
});

describe("the viewer draws what it was given", () => {
  it("a video Show gets a video element", () => {
    expect(viewer).toContain('kind === "video" ? (');
    expect(viewer).toContain("<video");
    expect(viewer).toContain("onLoadedMetadata={(e) => setMediaSecs(e.currentTarget.duration)}");
  });

  it("and the clock comes from the media, not from a constant", () => {
    expect(viewer).toContain("const duration = showDurationMs(show.media_url, mediaSecs);");
    expect(viewer).not.toContain("const DURATION = 5000;");
  });

  it("the tick measures against this run's own base", () => {
    // A duration arriving mid-Show would otherwise be applied against a
    // base measured for the old one, and the bar would jump.
    const fn = viewer.slice(viewer.indexOf("const lastP = progressRef.current;"));
    expect(fn.slice(0, 420)).toContain("let base = 0;");
    expect(fn.slice(0, 420)).toContain("if (base === 0) base = now - lastP * duration;");
  });

  it("holding the Show holds the picture too", () => {
    // Otherwise the clip plays on behind a frozen bar and the two are
    // describing different moments.
    const fn = viewer.slice(viewer.indexOf("const v = videoRef.current;"));
    expect(fn.slice(0, 300)).toContain("v.pause();");
  });

  it("and only autoplay refusal is answered by muting", () => {
    // A missing file or a codec the device will not take is a broken
    // Show; muting it would not help and would hide the real failure.
    expect(viewer).toContain('if ((err as { name?: string })?.name !== "NotAllowedError") return;');
  });

  it("the delete path shares the one extension test", () => {
    expect(viewer).toContain("const isVideo = isVideoUrl(show.media_url);");
    expect(viewer).not.toMatch(/\/\\\.\(mp4\|webm\|mov\|m4v\)/);
  });
});

describe("the grid draws what it was given too", () => {
  it("a photo tile is an image", () => {
    expect(grid).toContain("{isVideoUrl(s.media_url) ? (");
    expect(grid).toContain('alt={s.caption ?? "Show"}');
  });

  it("and a video tile keeps its poster", () => {
    // BLANK_POSTER exists to stop a black first frame flashing in.
    expect(grid).toContain("<video poster={BLANK_POSTER}");
  });
});

describe("what the reaper is allowed to delete", () => {
  const OWNER = "f7de5612-3fd9-41cb-9e0a-089c0a704576";
  const OTHER = "997b0da0-dc2e-485e-8cf4-4a300934efd4";
  const url = (bucket: string, path: string) =>
    `https://fyaioseridqabockidyp.supabase.co/storage/v1/object/public/${bucket}/${path}`;

  it("the Show's own upload, and that is all", () => {
    expect(reapableObjectPath(url("show-media", `${OWNER}/1730.jpg`), OWNER)).toBe(`${OWNER}/1730.jpg`);
  });

  it("never a shared post's image or a Shot's video", () => {
    // ShareSheet's share-to-your-Show writes those URLs into media_url.
    // They belong to content that is still there; deleting one because a
    // Show expired would destroy the original post.
    expect(reapableObjectPath(url("post-images", `${OWNER}/a.jpg`), OWNER)).toBe(null);
    expect(reapableObjectPath(url("shot-media", `${OWNER}/a.mp4`), OWNER)).toBe(null);
    expect(reapableObjectPath(url("chat-media", `${OWNER}/a.jpg`), OWNER)).toBe(null);
  });

  it("never somebody else's folder", () => {
    expect(reapableObjectPath(url("show-media", `${OTHER}/a.jpg`), OWNER)).toBe(null);
  });

  it("never a path that climbs out of it", () => {
    expect(reapableObjectPath(url("show-media", `${OWNER}/../${OTHER}/a.jpg`), OWNER)).toBe(null);
    expect(reapableObjectPath(url("show-media", `..%2F${OTHER}/a.jpg`), OWNER)).toBe(null);
  });

  it("never a bare file with no folder", () => {
    // Every Show upload is `<uid>/<ts>.<ext>`; anything else is not one.
    expect(reapableObjectPath(url("show-media", "loose.jpg"), OWNER)).toBe(null);
  });

  it("nor the folder itself", () => {
    // The owner check alone would pass this: the first segment is the
    // owner and there is nothing after it, so without the length guard
    // the reaper would hand Storage a folder to delete.
    expect(reapableObjectPath(url("show-media", OWNER), OWNER)).toBe(null);
    expect(reapableObjectPath(url("show-media", `${OWNER}/`), OWNER)).toBe(null);
  });

  it("never an empty segment", () => {
    expect(reapableObjectPath(url("show-media", `${OWNER}//a.jpg`), OWNER)).toBe(null);
  });

  it("and nothing at all when either side is missing", () => {
    expect(reapableObjectPath(null, OWNER)).toBe(null);
    expect(reapableObjectPath(url("show-media", `${OWNER}/a.jpg`), null)).toBe(null);
    expect(reapableObjectPath("", "")).toBe(null);
  });

  it("a token on the end is not part of the path", () => {
    expect(reapableObjectPath(url("show-media", `${OWNER}/a.jpg?t=1`), OWNER)).toBe(`${OWNER}/a.jpg`);
  });
});

describe("the reap route checks the caller's word", () => {
  const route = read("src/app/api/shows/reap/route.ts");

  it("the secret is compared in constant time", () => {
    expect(route).toContain('secretMatches(req.headers.get("x-show-reap-secret")');
  });

  it("and the window and the board are both re-read here", () => {
    // A leaked secret should not delete a Show posted this morning.
    //
    // The is_showcase flag used to be a third check. 0185 moved every
    // flagged Show onto a board and stopped anything reading the flag,
    // so the board check is the whole answer — and it is the same
    // condition can_see_show uses, which means what survives and what
    // is readable finally agree.
    expect(route).toContain("SHOW_ARCHIVE_DAYS * 86_400_000");
    expect(route).toContain('return NextResponse.json({ error: "not past the archive window" }, { status: 409 });');
    expect(route).not.toContain('if (show.is_showcase)');
    expect(route).toContain('.eq("show_id", showId)');
    expect(route).toContain('return NextResponse.json({ error: "on a board" }, { status: 409 });');
  });

  it("the object goes before the row, so bytes are never orphaned", () => {
    const rm = route.indexOf('.remove([path])');
    const del = route.indexOf('.from("shows").delete()');
    expect(rm).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(rm);
  });

  it("and a failed object delete keeps the row for the next run", () => {
    const branch = route.slice(route.indexOf("if (rmErr)"));
    expect(branch.slice(0, 320)).toContain('status: 500');
  });
});

describe("a Show carries its mentions", () => {
  const composer = read("src/components/create/ShotPreview.tsx");

  it("the insert sends what the typeahead collected", () => {
    // The dropdown has always offered names and the caption has always
    // kept them; only the insert dropped them.
    const insert = composer.slice(composer.indexOf('.from("shows").insert({'));
    expect(insert.slice(0, 760)).toContain("extractMentions(text)");
  });
});

describe("one extension test, not four", () => {
  it("the notifications screen uses the shared one", () => {
    const notifications = read("src/app/(app)/notifications/page.tsx");
    expect(notifications).toContain('import { isVideoUrl } from "@/lib/video-mime";');
    expect(notifications).not.toContain('const VIDEO_EXT = [".mp4", ".webm", ".mov", ".m4v"];');
  });
});
