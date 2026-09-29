import { describe, it, expect } from "vitest";
import {
  baseMime,
  videoMimeOf,
  isVideoFile,
  isAllowedVideo,
  uploadContentType,
  ALLOWED_VIDEO_MIME,
} from "@/lib/video-mime";

/**
 * The bug these exist to prevent: a Shot recorded in the app could not be
 * posted at all. MediaRecorder is asked for "video/webm;codecs=vp9,opus" and
 * the resulting File carries that whole string, while every check compared it
 * to a bare list with `includes`.
 */

/** What useVideoRecorder actually produces, in preference order. */
const RECORDED = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

describe("baseMime", () => {
  it("drops codec parameters", () => {
    expect(baseMime("video/webm;codecs=vp9,opus")).toBe("video/webm");
    expect(baseMime("video/mp4; codecs=avc1.42E01E")).toBe("video/mp4");
  });

  it("normalises case and whitespace", () => {
    expect(baseMime("Video/MP4 ")).toBe("video/mp4");
    expect(baseMime("  VIDEO/WEBM;codecs=vp8")).toBe("video/webm");
  });

  it("survives nothing at all", () => {
    for (const bad of ["", null, undefined]) expect(baseMime(bad)).toBe("");
  });
});

describe("videoMimeOf", () => {
  it("reads the type when there is one", () => {
    expect(videoMimeOf({ type: "video/webm;codecs=vp9,opus", name: "x.webm" })).toBe("video/webm");
  });

  it("falls back to the extension when a picker gives no type", () => {
    // Some Android galleries hand over a File with type "".
    expect(videoMimeOf({ type: "", name: "clip.MP4" })).toBe("video/mp4");
    expect(videoMimeOf({ type: "", name: "clip.mov" })).toBe("video/quicktime");
    expect(videoMimeOf({ type: undefined, name: "clip.webm" })).toBe("video/webm");
  });

  it("prefers the declared type over the extension", () => {
    expect(videoMimeOf({ type: "video/quicktime", name: "mislabelled.webm" })).toBe("video/quicktime");
  });

  it("gives nothing for something it cannot identify", () => {
    expect(videoMimeOf({ type: "", name: "clip.mkv" })).toBe("");
    expect(videoMimeOf({ type: "", name: "noextension" })).toBe("");
  });
});

describe("isVideoFile", () => {
  it("recognises a recording however it is labelled", () => {
    for (const t of RECORDED) expect(isVideoFile({ type: t, name: "s.webm" })).toBe(true);
  });

  it("recognises an untyped file by its extension", () => {
    expect(isVideoFile({ type: "", name: "clip.mov" })).toBe(true);
  });

  it("does not call a photo a video", () => {
    expect(isVideoFile({ type: "image/jpeg", name: "p.jpg" })).toBe(false);
  });
});

describe("isAllowedVideo", () => {
  it("accepts every format the recorder can produce", () => {
    // This is the regression. Each of these was rejected before.
    for (const t of RECORDED) {
      expect(isAllowedVideo({ type: t, name: "shot.webm" })).toBe(true);
    }
  });

  it("accepts a gallery pick with plain types", () => {
    for (const t of ALLOWED_VIDEO_MIME) {
      expect(isAllowedVideo({ type: t, name: "g.mp4" })).toBe(true);
    }
  });

  it("still refuses a format the bucket will not take", () => {
    expect(isAllowedVideo({ type: "video/x-matroska", name: "a.mkv" })).toBe(false);
    expect(isAllowedVideo({ type: "video/ogg", name: "a.ogv" })).toBe(false);
    expect(isAllowedVideo({ type: "image/jpeg", name: "a.jpg" })).toBe(false);
  });
});

describe("uploadContentType", () => {
  it("never sends codec parameters to the bucket", () => {
    // Not because the bucket would refuse them — it compares base types —
    // but because they become the served content-type header.
    for (const t of RECORDED) {
      const sent = uploadContentType({ type: t, name: "s.webm" });
      expect(sent).not.toContain(";");
      expect(ALLOWED_VIDEO_MIME as readonly string[]).toContain(sent);
    }
  });

  it("names an untyped file by its extension rather than sending nothing", () => {
    expect(uploadContentType({ type: "", name: "clip.mp4" })).toBe("video/mp4");
  });

  it("falls back rather than sending an empty content type", () => {
    expect(uploadContentType({ type: "", name: "mystery" })).toBe("video/webm");
    expect(uploadContentType({ type: "", name: "mystery" }, "video/mp4")).toBe("video/mp4");
  });

  it("passes a non-video base type through for the image paths", () => {
    expect(uploadContentType({ type: "image/jpeg", name: "p.jpg" })).toBe("image/jpeg");
  });
});
