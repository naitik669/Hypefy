import { describe, it, expect } from "vitest";
import { mediaThumb } from "@/app/(app)/notifications/page";

/**
 * The little square beside a row in Activity.
 *
 * Every Shot row came out empty. The square held a <video> whose `poster` was
 * pinned to a transparent 1x1 — and a <video> shows its poster INSTEAD of a
 * frame until it plays, so a blank poster guaranteed a blank square. The
 * Shot's own cover was not even fetched, though it had one.
 */

const POSTER = "https://x.test/shot-poster.jpg";
const VIDEO = "https://x.test/shot.mp4";

describe("a Shot's thumbnail", () => {
  it("is its own cover", () => {
    expect(mediaThumb({ media_url: VIDEO, poster_url: POSTER })).toEqual({ url: POSTER });
  });

  it("is never the video itself, which would draw nothing", () => {
    expect(mediaThumb({ media_url: VIDEO, poster_url: POSTER })?.url).not.toContain(".mp4");
  });

  it("is nothing at all when the Shot has no cover, rather than an empty box", () => {
    // A posterless <video> seeked to a frame is the other way out, and it
    // brings back Android's grey play-circle on every row. No square beats a
    // hole where a square should be — a text post already has no square.
    expect(mediaThumb({ media_url: VIDEO, poster_url: null })).toBeNull();
  });
});

describe("a Show's thumbnail, which has no poster column at all", () => {
  it("is drawn when it is a picture", () => {
    expect(mediaThumb({ media_url: "https://x.test/show.jpg" })).toEqual({
      url: "https://x.test/show.jpg",
    });
  });

  it("is dropped when the file says video", () => {
    // A video in an <img> is the same blank square by another route.
    for (const ext of ["mp4", "webm", "mov", "m4v", "MP4"]) {
      expect(mediaThumb({ media_url: `https://x.test/show.${ext}` }), ext).toBeNull();
    }
  });

  it("reads the extension past a query string or a fragment", () => {
    expect(mediaThumb({ media_url: "https://x.test/a.mp4?token=1" })).toBeNull();
    expect(mediaThumb({ media_url: "https://x.test/a.mp4#t=1" })).toBeNull();
    // ".mp4" inside a folder name is not an extension.
    expect(mediaThumb({ media_url: "https://x.test/a.mp4/cover.jpg" })).toEqual({
      url: "https://x.test/a.mp4/cover.jpg",
    });
  });
});

describe("nothing to draw", () => {
  it("is nothing, not an empty box", () => {
    expect(mediaThumb(null)).toBeNull();
    expect(mediaThumb(undefined)).toBeNull();
    expect(mediaThumb({ media_url: null, poster_url: null })).toBeNull();
  });
});
