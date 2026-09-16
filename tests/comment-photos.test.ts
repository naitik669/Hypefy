import { describe, it, expect } from "vitest";
import { mediaBody } from "@/components/feed/CommentsSheet";
import {
  fitWithin,
  isCommentPhotoType,
  COMMENT_PHOTO_MAX_EDGE,
} from "@/lib/comment-photo";

/**
 * A comment can be a picture, and a picture is not "anything that starts with
 * https://" — which is what it used to mean, so a comment that was a link to
 * a page rendered as a broken image.
 */
describe("what counts as a picture in a comment body", () => {
  it("takes the GIF hosts the picker sends you to", () => {
    expect(mediaBody("https://media.tenor.com/abc/cat.gif")).toBe(
      "https://media.tenor.com/abc/cat.gif",
    );
    expect(mediaBody("https://media1.giphy.com/media/xyz/giphy.gif")).toBeTruthy();
  });

  it("takes a URL that ends in an image", () => {
    expect(mediaBody("https://example.test/a/b.jpg")).toBeTruthy();
    expect(mediaBody("https://example.test/a/b.png?width=400")).toBeTruthy();
  });

  it("leaves a plain link alone", () => {
    // This is the bug: posting a link used to render an image that could
    // never load.
    expect(mediaBody("https://hypefy.chat/about")).toBeNull();
    expect(mediaBody("https://example.test/read/this-post")).toBeNull();
  });

  it("leaves anything with words around it alone", () => {
    expect(mediaBody("look https://media.tenor.com/a/cat.gif")).toBeNull();
    expect(mediaBody("nice one")).toBeNull();
    expect(mediaBody("")).toBeNull();
  });
});

describe("a photo on its way up", () => {
  it("only accepts what the bucket does", () => {
    for (const ok of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(isCommentPhotoType(ok)).toBe(true);
    }
    for (const no of ["image/heic", "video/mp4", "application/pdf", ""]) {
      expect(isCommentPhotoType(no)).toBe(false);
    }
  });

  it("shrinks the long edge and keeps the shape", () => {
    const tall = fitWithin(3024, 4032);
    expect(Math.max(tall.w, tall.h)).toBe(COMMENT_PHOTO_MAX_EDGE);
    expect(tall.w / tall.h).toBeCloseTo(3024 / 4032, 2);

    const wide = fitWithin(4032, 3024);
    expect(Math.max(wide.w, wide.h)).toBe(COMMENT_PHOTO_MAX_EDGE);
  });

  it("leaves a picture that already fits exactly as it is", () => {
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
