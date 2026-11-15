import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_ALT, altFor, hasAlt, postSlots, readPostMedia } from "@/lib/post-media";

/**
 * Describing a picture, for somebody who cannot see it.
 *
 * The app had none at all: no alt_text or altText anywhere in src, and
 * every <img> in a post carried the caption or a bare "Post". A caption is
 * not a description — it says what you think about the photo, not what is
 * in it — and on a ten-photo carousel it put the same sentence on all ten.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const composer = read("src/components/post/PostComposer.tsx");
const card = read("src/components/feed/FeedCard.tsx");

const A = "https://x.supabase.co/storage/v1/object/public/post-images/u/a.jpg";
const B = "https://x.supabase.co/storage/v1/object/public/post-images/u/b.jpg";
const V = "https://x.supabase.co/storage/v1/object/public/post-videos/u/c.mp4";

describe("what gets stored", () => {
  it("a description, trimmed", () => {
    const [s] = readPostMedia([{ kind: "image", url: A, alt: "  a dog on a sofa  " }]);
    expect(s.alt).toBe("a dog on a sofa");
  });

  it("blank is the same as unwritten", () => {
    // An empty string in an alt attribute means "decorative, skip me",
    // which is a claim nobody made by leaving the box empty.
    expect(readPostMedia([{ kind: "image", url: A, alt: "   " }])[0].alt).toBe(null);
    expect(readPostMedia([{ kind: "image", url: A, alt: "" }])[0].alt).toBe(null);
  });

  it("and anything that is not text is not a description", () => {
    for (const bad of [42, {}, [], true, null, undefined]) {
      expect(readPostMedia([{ kind: "image", url: A, alt: bad }])[0].alt, String(bad)).toBe(null);
    }
  });

  it("bounded, because it is read aloud and it lands in a sized column", () => {
    const long = "x".repeat(MAX_ALT + 200);
    expect(readPostMedia([{ kind: "image", url: A, alt: long }])[0].alt).toHaveLength(MAX_ALT);
  });

  it("longer than a caption, on purpose", () => {
    // A description does a different job and often needs more words.
    expect(MAX_ALT).toBeGreaterThan(280);
  });

  it("a video can be described too", () => {
    const [s] = readPostMedia([{ kind: "video", url: V, poster: null, duration: 3, alt: "a cat" }]);
    expect(s.alt).toBe("a cat");
  });

  it("and a post that predates all this has none, stated rather than guessed", () => {
    const slots = postSlots({ image_urls: [A, B], image_url: A });
    expect(slots.every((s) => s.alt === null)).toBe(true);
    expect(hasAlt(slots)).toBe(false);
  });
});

describe("what a reader is told", () => {
  it("the description when there is one", () => {
    const slots = postSlots({ media: [{ kind: "image", url: A, alt: "a dog on a sofa" }] });
    expect(altFor(slots, 0)).toBe("a dog on a sofa");
  });

  it("and the position when there is not, which is genuinely useful", () => {
    // "Photo 2 of 3" tells somebody where they are in a carousel.
    const slots = postSlots({ media: [
      { kind: "image", url: A, alt: null },
      { kind: "image", url: B, alt: null },
    ] });
    expect(altFor(slots, 1)).toBe("Photo 2 of 2");
  });

  it("without the counting when there is only one", () => {
    expect(altFor(postSlots({ image_urls: [A], image_url: A }), 0)).toBe("Photo");
  });

  it("naming a clip a clip", () => {
    const slots = postSlots({ media: [{ kind: "video", url: V, poster: null, duration: 2, alt: null }] });
    expect(altFor(slots, 0)).toBe("Video");
  });

  it("and never the caption", () => {
    // The whole reason this exists: the caption was on all ten photos and
    // described none of them.
    const slots = postSlots({ media: [{ kind: "image", url: A, alt: null }] });
    expect(altFor(slots, 0)).not.toContain("caption");
    expect(card).not.toContain('alt={post.caption ?? "Post"}');
  });

  it("out of range says nothing rather than throwing", () => {
    expect(altFor(postSlots({ image_urls: [A], image_url: A }), 9)).toBe("");
  });
});

describe("writing one", () => {
  it("there is a control on every picture in the composer", () => {
    expect(composer).toContain("setDescribing(img.id)");
    expect(composer).toContain("ALT");
  });

  it("lit once something is written, so the gaps are visible at a glance", () => {
    expect(composer).toContain('img.alt ? "bg-accent text-accent-ink" : "bg-black/55 text-white"');
  });

  it("and cropping does not throw the description away", () => {
    // The aspect picker re-crops from the original; what the picture shows
    // has not changed.
    expect(composer).toContain("alt: imgs.find((p) => p.id === crop.id)?.alt ?? null");
  });

  it("the upload carries it through to both kinds of slot", () => {
    const up = read("src/components/upload/UploadProvider.tsx");
    expect((up.match(/alt: pick\.alt,/g) ?? [])).toHaveLength(2);
  });
});

describe("the clip in the composer strip is a player, not a broken image", () => {
  it("rendered as video", () => {
    // Every pick was drawn with an img tag, which was right until a pick
    // could be a clip.
    expect(composer).toContain('img.kind === "video" ?');
  });

  it("with a stand-in poster, like every other player in the app", () => {
    expect(composer).toContain("poster={BLANK_POSTER}");
  });
});
