import { describe, it, expect } from "vitest";
import {
  MAX_POST_SLOTS,
  MAX_POST_VIDEO_SECS,
  POST_AND_SHOT_CAPS_AGREE,
  coverOf,
  hasVideo,
  imageUrlsOf,
  isVideoOnly,
  postSlots,
  readPostMedia,
  videoSecondsOf,
  type PostSlot,
} from "@/lib/post-media";
import { MAX_SHOT_SECS } from "@/lib/shot-trim";

/**
 * What a post carries, slot by slot.
 *
 * The model has to hold a video anywhere in the order while leaving the
 * photo columns every other reader depends on exactly as they were. So these
 * tests pin two things: that a malformed slot is dropped rather than drawn,
 * and that a post made before any of this still reads as its photos.
 */

const img = (n: number) => ({ kind: "image", url: `https://cdn.test/${n}.jpg` });
const vid = (over: Record<string, unknown> = {}) => ({
  kind: "video",
  url: "https://cdn.test/clip.mp4",
  poster: "https://cdn.test/clip.jpg",
  duration: 12.5,
  ...over,
});

describe("reading a post's slots", () => {
  it("keeps the order it was given, video and all", () => {
    const slots = readPostMedia([img(1), vid(), img(2)]);
    expect(slots.map((s) => s.kind)).toEqual(["image", "video", "image"]);
    expect(slots[1]).toMatchObject({ url: "https://cdn.test/clip.mp4", duration: 12.5 });
  });

  it("nothing at all reads as no slots, never as a crash", () => {
    for (const junk of [null, undefined, "nope", 7, {}, { kind: "image" }]) {
      expect(readPostMedia(junk), String(junk)).toEqual([]);
    }
  });

  it("a slot with no url is dropped, because a blank page mid-swipe is worse", () => {
    expect(readPostMedia([img(1), { kind: "image" }, img(2)])).toHaveLength(2);
    expect(readPostMedia([{ kind: "video", poster: "https://cdn.test/a.jpg" }])).toEqual([]);
  });

  it("only https, since these are our own buckets", () => {
    for (const bad of ["http://cdn.test/a.jpg", "javascript:alert(1)", "//cdn.test/a.jpg", "data:image/png;base64,x"]) {
      expect(readPostMedia([{ kind: "image", url: bad }]), bad).toEqual([]);
    }
  });

  it("an unknown kind is left out rather than guessed from the extension", () => {
    // A future audio or document slot must not render as whichever of these
    // two it least resembles.
    expect(readPostMedia([{ kind: "audio", url: "https://cdn.test/a.mp3" }])).toEqual([]);
    expect(readPostMedia([{ url: "https://cdn.test/a.jpg" }])).toEqual([]);
  });

  it("stops at the slot cap", () => {
    const many = Array.from({ length: MAX_POST_SLOTS + 5 }, (_, i) => img(i));
    expect(readPostMedia(many)).toHaveLength(MAX_POST_SLOTS);
  });

  it("a clip longer than the cap keeps its url and loses only the claim", () => {
    // The duration is a label; refusing the whole slot over it would lose
    // the video. The composer is what enforces the length on the way in.
    const [slot] = readPostMedia([vid({ duration: MAX_POST_VIDEO_SECS + 1 })]);
    expect(slot.kind).toBe("video");
    expect((slot as { duration: number | null }).duration).toBeNull();
  });

  it("and a duration that is not a positive number reads as absent", () => {
    for (const bad of [0, -3, NaN, Infinity, "12", null]) {
      const [slot] = readPostMedia([vid({ duration: bad })]);
      expect((slot as { duration: number | null }).duration, String(bad)).toBeNull();
    }
  });

  it("a video with no poster is still a video", () => {
    const [slot] = readPostMedia([vid({ poster: null })]);
    expect(slot).toMatchObject({ kind: "video", poster: null });
  });
});

describe("a post made before any of this", () => {
  it("reads as its photos, with no backfill", () => {
    const slots = postSlots({ image_urls: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"] });
    expect(slots.map((s) => s.kind)).toEqual(["image", "image"]);
    expect(imageUrlsOf(slots)).toEqual(["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"]);
  });

  it("falls back to the single image_url a very old row has", () => {
    expect(postSlots({ image_url: "https://cdn.test/1.jpg", image_urls: [] })).toHaveLength(1);
  });

  it("a text-only post has no slots and does not pretend to", () => {
    expect(postSlots({ image_url: null, image_urls: [] })).toEqual([]);
    expect(postSlots({})).toEqual([]);
  });

  it("and `media` wins wherever it exists", () => {
    // Both are written on a new post, so a row carrying both must not read
    // its photos twice.
    const slots = postSlots({
      media: [img(1), vid()],
      image_urls: ["https://cdn.test/1.jpg"],
    });
    expect(slots.map((s) => s.kind)).toEqual(["image", "video"]);
  });
});

describe("what the photo columns get written with", () => {
  it("the photo slots only, in order", () => {
    const slots = readPostMedia([vid(), img(1), img(2)]);
    expect(imageUrlsOf(slots)).toEqual(["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"]);
  });

  it("and a video-only post writes none", () => {
    expect(imageUrlsOf(readPostMedia([vid()]))).toEqual([]);
  });
});

describe("the one still image that stands for the post", () => {
  it("is the first slot's own picture, not the first photo anywhere", () => {
    // A grid tile showing slot 2 would not be what the post opens with.
    const slots = readPostMedia([vid(), img(1)]);
    expect(coverOf(slots)).toBe("https://cdn.test/clip.jpg");
  });

  it("is the photo when the post opens with one", () => {
    expect(coverOf(readPostMedia([img(1), vid()]))).toBe("https://cdn.test/1.jpg");
  });

  it("falls back to a later photo when the opening clip has no poster", () => {
    expect(coverOf(readPostMedia([vid({ poster: null }), img(1)]))).toBe("https://cdn.test/1.jpg");
  });

  it("and is null only when there is genuinely nothing to show", () => {
    expect(coverOf(readPostMedia([vid({ poster: null })]))).toBeNull();
    expect(coverOf([])).toBeNull();
  });
});

describe("what a post is", () => {
  it("knows whether it carries a clip at all", () => {
    expect(hasVideo(readPostMedia([img(1)]))).toBe(false);
    expect(hasVideo(readPostMedia([img(1), vid()]))).toBe(true);
  });

  it("knows the single-clip case, which is the Shots-shaped one", () => {
    expect(isVideoOnly(readPostMedia([vid()]))).toBe(true);
    expect(isVideoOnly(readPostMedia([vid(), img(1)]))).toBe(false);
    expect(isVideoOnly(readPostMedia([img(1)]))).toBe(false);
  });

  it("adds up its video, treating an unmeasured clip as nothing", () => {
    expect(videoSecondsOf(readPostMedia([vid({ duration: 10 }), vid({ duration: 5 })]))).toBe(15);
    expect(videoSecondsOf(readPostMedia([vid({ duration: null })]))).toBe(0);
  });
});

describe("the length caps", () => {
  it("a post's clip is capped at a minute", () => {
    expect(MAX_POST_VIDEO_SECS).toBe(60);
  });

  it("and agrees with a Shot's cap while it is meant to", () => {
    // Its own constant on purpose — but if one moves, this fails rather than
    // leaving the composer trimming to one number and the reader refusing at
    // another.
    expect(POST_AND_SHOT_CAPS_AGREE).toBe(true);
    expect(MAX_POST_VIDEO_SECS).toBe(MAX_SHOT_SECS);
  });
});

describe("the type keeps the two slots apart", () => {
  it("so a photo cannot be read for a duration", () => {
    const slots: PostSlot[] = readPostMedia([img(1)]);
    const first = slots[0];
    // A compile-time guarantee, asserted at runtime so the test fails rather
    // than merely stops type-checking if the union is loosened.
    expect(first.kind === "image" && !("duration" in first)).toBe(true);
  });
});
