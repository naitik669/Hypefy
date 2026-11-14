import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_POST_IMAGE_MB,
  SHRINK_OVER_BYTES,
  UPLOAD_MAX_EDGE,
  fitWithin,
  worthShrinking,
} from "@/lib/post-image";

/**
 * The composer promised 10MB and the bucket refused anything over 1.5MB, so
 * every photo in between passed every check on the way in and died at the
 * upload as "Couldn't share your post". A phone JPEG is 3-6MB, so that was
 * most photos.
 *
 * It hid in Auto mode, which is the default: a cropped photo goes through a
 * canvas and comes out small by accident, an Auto one is passed through
 * untouched on purpose. So it looked intermittent and was really "did you
 * happen to crop it".
 *
 * Two halves. 0197 raises the bucket to the number already promised, and
 * the composer now imports that number instead of keeping its own copy.
 * shrinkForUpload fits the photo inside a box first, so the usual upload is
 * about a megabyte rather than merely a permitted six.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("fitting a photo in the box", () => {
  it("leaves anything already inside it alone", () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    // Exactly on the edge is inside, not outside.
    expect(fitWithin(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 });
  });

  it("scales the long edge down and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    // Portrait: the long edge is the height.
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it("never scales up", () => {
    const { width, height } = fitWithin(100, 100, 2048);
    expect(width).toBe(100);
    expect(height).toBe(100);
  });

  it("never rounds a thin edge to nothing", () => {
    // A canvas of zero area produces an empty blob, which would upload a
    // broken photo rather than a large one.
    // 2 / 10000 * 2048 = 0.41, which rounds to zero without the floor.
    // The first version of this used 8000x3, which rounds to 1 on its own
    // and so proved nothing.
    const { width, height } = fitWithin(10000, 2, 2048);
    expect(height).toBeGreaterThanOrEqual(1);
    expect(width).toBe(2048);
  });

  it("and survives a shape it cannot use", () => {
    expect(fitWithin(0, 0, 2048)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(-5, 10, 2048)).toEqual({ width: 0, height: 0 });
  });
});

describe("what is worth re-encoding", () => {
  it("not a small photo", () => {
    // Re-encoding a 300kB JPEG can make it bigger, and never makes it better.
    expect(worthShrinking({ size: 300_000, type: "image/jpeg" })).toBe(false);
  });

  it("a big one, yes", () => {
    expect(worthShrinking({ size: 6_000_000, type: "image/jpeg" })).toBe(true);
  });

  it("but not a type canvas cannot write back", () => {
    // A HEIC would decode and then fail to re-encode, leaving an empty blob.
    expect(worthShrinking({ size: 6_000_000, type: "image/heic" })).toBe(false);
    expect(worthShrinking({ size: 6_000_000, type: "" })).toBe(false);
  });
});

describe("the two numbers that disagreed", () => {
  it("the composer takes the limit from here rather than keeping its own", () => {
    const composer = read("src/components/post/PostComposer.tsx");
    expect(composer).toContain("MAX_POST_IMAGE_MB");
    // The literal is the bug: 10 here and 1.5 in the bucket is how this
    // started. The number lives in one file now.
    expect(composer).not.toMatch(/const MAX_SIZE_MB = \d/);
  });

  it("and the bucket was raised to meet it", () => {
    const sql = read("supabase/migrations/0197_post_images_match_the_composer.sql");
    expect(sql).toContain("10485760");
    expect(sql).toContain("post-images");
    // 10MB in bytes, so the migration and the constant say the same thing.
    expect(MAX_POST_IMAGE_MB * 1024 * 1024).toBe(10485760);
  });

  it("the upload actually shrinks before it sends", () => {
    const uploader = read("src/components/upload/UploadProvider.tsx");
    expect(uploader).toContain("shrinkForUpload(a.files[i])");
  });

  it("and the box is smaller than the ceiling it protects", () => {
    expect(UPLOAD_MAX_EDGE).toBeGreaterThan(0);
    expect(SHRINK_OVER_BYTES).toBeLessThan(MAX_POST_IMAGE_MB * 1024 * 1024);
  });
});
