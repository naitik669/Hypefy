import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isVideoUrl } from "@/lib/video-mime";
import {
  SHOW_PHOTO_MS,
  SHOW_VIDEO_FALLBACK_MS,
  SHOW_VIDEO_MAX_MS,
  SHOW_VIDEO_MIN_MS,
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
