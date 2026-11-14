import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_POST_VIDEO_SECS,
  coverOf,
  hasVideo,
  imageUrlsOf,
  isVideoOnly,
  postSlots,
  readPostMedia,
} from "@/lib/post-media";

/**
 * A post can carry a clip.
 *
 * 0195 added posts.media and the bucket, src/lib/post-media.ts was written
 * and tested, and then nothing imported it: the composer took images only,
 * nothing wrote the column, and post-videos appeared nowhere in src. The
 * model sat finished and unused.
 *
 * The shape is additive on purpose. `media` is the truth for a new post
 * and image_url / image_urls keep being written, so the twenty-eight files
 * that read the photo columns keep working untouched and there is no
 * backfill to get half-done.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const composer = read("src/components/post/PostComposer.tsx");
const uploader = read("src/components/upload/UploadProvider.tsx");
const card = read("src/components/feed/FeedCard.tsx");

const V = "https://x.supabase.co/storage/v1/object/public/post-videos/u/clip.mp4";
const P = "https://x.supabase.co/storage/v1/object/public/post-videos/u/poster.jpg";
const A = "https://x.supabase.co/storage/v1/object/public/post-images/u/a.jpg";
const clip = { kind: "video", url: V, poster: P, duration: 9 };
const photo = { kind: "image", url: A };

describe("a post made before video still behaves exactly as it did", () => {
  it("its slots come from the photo columns", () => {
    const slots = postSlots({ image_urls: [A], image_url: A });
    expect(slots).toEqual([{ kind: "image", url: A }]);
  });

  it("and a text-only post has none", () => {
    expect(postSlots({ image_urls: [], image_url: null })).toEqual([]);
  });
});

describe("a mixed carousel keeps its order", () => {
  const slots = postSlots({ media: [photo, clip, photo] });

  it("the clip stays where it was put", () => {
    expect(slots.map((s) => s.kind)).toEqual(["image", "video", "image"]);
  });

  it("only the photos go into image_urls, for every older reader", () => {
    expect(imageUrlsOf(slots)).toEqual([A, A]);
  });

  it("and the cover is what the post opens with", () => {
    expect(coverOf(slots)).toBe(A);
  });
});

describe("a video-first post is not invisible to older readers", () => {
  const slots = postSlots({ media: [clip] });

  it("its cover is the poster, not nothing", () => {
    // image_urls is empty for a video-only post, so a grid reading the
    // photo columns would have shown a blank tile. image_url is written
    // with this instead.
    expect(coverOf(slots)).toBe(P);
    expect(imageUrlsOf(slots)).toEqual([]);
  });

  it("and it is recognisably a clip", () => {
    expect(hasVideo(slots)).toBe(true);
    expect(isVideoOnly(slots)).toBe(true);
  });

  it("a clip whose poster failed to capture falls back rather than blanking", () => {
    const noPoster = postSlots({ media: [{ ...clip, poster: null }, photo] });
    expect(coverOf(noPoster)).toBe(A);
  });
});

describe("a crafted media column is dropped, not half-drawn", () => {
  it("rejects anything that is not an array of slots", () => {
    expect(readPostMedia({ evil: 1 })).toEqual([]);
    expect(readPostMedia("nope")).toEqual([]);
    expect(readPostMedia(null)).toEqual([]);
  });

  it("drops a slot of an unknown kind", () => {
    expect(readPostMedia([{ kind: "script", url: A }])).toEqual([]);
  });

  it("and refuses a url that is not one of our buckets", () => {
    // https only — these are our own objects, and a javascript: url in an
    // <a href> or a <video src> is the oldest trick there is.
    expect(readPostMedia([{ kind: "image", url: "javascript:alert(1)" }])).toEqual([]);
    expect(readPostMedia([{ kind: "image", url: "http://evil.example/x.jpg" }])).toEqual([]);
  });

  it("and will not be made expensive to read", () => {
    const many = Array.from({ length: 11 }, () => photo);
    expect(readPostMedia(many).length).toBeLessThanOrEqual(10);
  });
});

describe("the composer takes a clip", () => {
  it("offers video in the file picker", () => {
    // The accept attribute, not the import. Asserting the bare name passed
    // against a composer that imported it and then did not use it.
    expect(composer).toContain("accept={[...POST_IMAGE_TYPES, ...ALLOWED_VIDEO_MIME]");
  });

  it("measures it at pick time, which is the only moment it can", () => {
    // Refusing a two-minute video after it has gone up a phone uplink is
    // the worst possible moment to find out.
    expect(composer).toContain("await clipSeconds(url)");
    expect(composer).toContain("secs > MAX_POST_VIDEO_SECS");
  });

  it("but lets one through whose length it could not read", () => {
    // null means "we do not know", the same call the poster path makes.
    expect(composer).toContain("secs !== null && secs > MAX_POST_VIDEO_SECS");
  });

  it("and never sends a clip to the cropper", () => {
    // Cropping re-encodes through a canvas; for a clip that means decoding
    // and re-encoding the whole thing on a phone.
    expect(composer).toContain('.filter((p) => p.kind === "image")');
  });
});

describe("the upload writes all three columns", () => {
  it("media, in the order the slots were picked", () => {
    expect(uploader).toContain("media: slots.length ? slots : null");
  });

  it("image_urls with the photos only, so old readers are unchanged", () => {
    expect(uploader).toContain("const urls = imageUrlsOf(slots);");
  });

  it("and image_url with the cover, so nothing shows a blank tile", () => {
    expect(uploader).toContain("image_url: coverOf(slots)");
  });

  it("the clip goes in its own bucket", () => {
    expect(uploader).toContain('.from("post-videos")');
  });

  it("and its poster is checked against the blocklist like any other image", () => {
    const vid = uploader.slice(uploader.indexOf('if (pick.kind === "video")'));
    expect(vid.slice(0, 2000)).toContain('supabase.rpc("check_media"');
  });
});

describe("the feed plays it", () => {
  it("reads slots rather than the photo columns", () => {
    // The call site, not the helper it lives in: emptying the variable
    // left postSlots sitting unused in the file and the test still passed.
    expect(card).toContain("const slots = slotsFor(post);");
    expect(card).toContain("postSlots({");
    expect(card).not.toContain("function getImages(");
  });

  it("renders a video element for a video slot", () => {
    expect(card).toContain('slot.kind === "video" ?');
    expect(card).toContain("<video");
  });

  it("muted, because sound in a feed you are scrolling is not wanted", () => {
    // And an unmuted autoplay is refused anyway, which would leave a
    // frozen frame instead of a playing clip.
    const v = card.slice(card.indexOf('slot.kind === "video" ?'));
    const tag = v.slice(v.indexOf("<video"), v.indexOf("/>"));
    expect(tag).toContain("muted");
    expect(tag).toContain("playsInline");
  });

  it("and contained, not cropped a second time", () => {
    const v = card.slice(card.indexOf('slot.kind === "video" ?'));
    const tag = v.slice(v.indexOf("<video"), v.indexOf("/>"));
    expect(tag).toContain("object-contain");
    expect(tag).not.toContain("object-cover");
  });
});

describe("a scheduled post keeps its clip", () => {
  it("the column exists on the other table too", () => {
    // publish_due_scheduled_posts copies column by column, so one missing
    // from either side is one the scheduled copy silently drops — which is
    // exactly why 0035 had to add aspect_ratio in both places.
    const m = read("supabase/migrations/0209_scheduled_posts_carry_media.sql");
    expect(m).toContain("alter table public.scheduled_posts");
    expect(m).toContain("add column if not exists media jsonb");
  });

  it("and the publisher carries it across", () => {
    const m = read("supabase/migrations/0209_scheduled_posts_carry_media.sql");
    const fn = m.slice(m.indexOf("create or replace function"));
    expect((fn.match(/media/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("the two caps", () => {
  it("a post's clip and a Shot agree, and say so if they stop", () => {
    expect(MAX_POST_VIDEO_SECS).toBe(60);
  });
});
