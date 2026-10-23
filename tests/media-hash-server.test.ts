import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { MATCH_DISTANCE, hammingDistance, isHash } from "@/lib/media-hash";
import { hashImageBuffer, isOwnStorageUrl } from "@/lib/media-hash-server";

/**
 * The server-side hash, through real image codecs.
 *
 * The client-side tests use synthetic pixel buffers because a browser canvas
 * cannot run in Node. This one does not have to: sharp encodes and decodes
 * actual JPEG, PNG and WebP, so these are the transformations a real upload
 * goes through — a phone re-encoding, a format change, a resize — rather
 * than a model of them.
 */

const W = 600;
const H = 400;

/** A picture with enough structure to tell from another one. */
async function picture(seed: number): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  const r = (n: number) => {
    let s = (seed * 2654435761 + n) >>> 0;
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const waves = [0, 1, 2].map((i) => ({
    fx: r(i * 3) * 0.08,
    fy: r(i * 3 + 1) * 0.08,
    ph: r(i * 3 + 2) * 6.28,
  }));
  const blobX = r(20) * W;
  const blobY = r(21) * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 128;
      for (const w of waves) v += 45 * Math.sin(w.fx * x + w.fy * y + w.ph);
      const d = Math.hypot(x - blobX, y - blobY);
      v += 70 * Math.exp(-(d * d) / (2 * 90 * 90));
      const i = (y * W + x) * 3;
      const c = Math.max(0, Math.min(255, v)) | 0;
      raw[i] = c;
      raw[i + 1] = Math.max(0, Math.min(255, c * 0.85)) | 0;
      raw[i + 2] = Math.max(0, Math.min(255, 255 - c * 0.6)) | 0;
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

describe("hashing real image files", () => {
  it("produces a hash from a PNG", async () => {
    const h = await hashImageBuffer(await picture(1));
    expect(isHash(h!)).toBe(true);
  });

  it("is unchanged by a JPEG round trip at ordinary quality", async () => {
    // What a phone does to a photo on the way out of the gallery.
    const png = await picture(2);
    const jpeg = await sharp(png).jpeg({ quality: 85 }).toBuffer();
    const d = hammingDistance((await hashImageBuffer(png))!, (await hashImageBuffer(jpeg))!);
    expect(d).toBeLessThanOrEqual(MATCH_DISTANCE);
  });

  it("survives a brutal JPEG re-encode", async () => {
    const png = await picture(3);
    const awful = await sharp(png).jpeg({ quality: 25 }).toBuffer();
    const d = hammingDistance((await hashImageBuffer(png))!, (await hashImageBuffer(awful))!);
    expect(d).toBeLessThanOrEqual(MATCH_DISTANCE);
  });

  it("survives being resized to a quarter", async () => {
    // Re-uploading a picture that has been through another app usually means
    // a smaller copy of it.
    const png = await picture(4);
    const small = await sharp(png).resize(W / 4, H / 4).png().toBuffer();
    const d = hammingDistance((await hashImageBuffer(png))!, (await hashImageBuffer(small))!);
    expect(d).toBeLessThanOrEqual(MATCH_DISTANCE);
  });

  it("survives a change of format to WebP", async () => {
    const png = await picture(5);
    const webp = await sharp(png).webp({ quality: 80 }).toBuffer();
    const d = hammingDistance((await hashImageBuffer(png))!, (await hashImageBuffer(webp))!);
    expect(d).toBeLessThanOrEqual(MATCH_DISTANCE);
  });

  it("tells different pictures apart, with room to spare", async () => {
    const hashes = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(async (s) => (await hashImageBuffer(await picture(s)))!));
    let closest = 64;
    for (let a = 0; a < hashes.length; a++) {
      for (let b = a + 1; b < hashes.length; b++) {
        closest = Math.min(closest, hammingDistance(hashes[a], hashes[b]));
      }
    }
    expect(closest).toBeGreaterThan(MATCH_DISTANCE);
  });

  it("reads a transparent PNG the same way the client does", async () => {
    // Flattened onto white. If the two sides disagreed here, the blocklist
    // would be built from one and checked against the other.
    const opaque = await sharp({
      create: { width: W, height: H, channels: 3, background: "#ffffff" },
    })
      .composite([{ input: await picture(9), blend: "over", left: 100, top: 50 }])
      .png()
      .toBuffer();
    const transparent = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: await picture(9), blend: "over", left: 100, top: 50 }])
      .png()
      .toBuffer();
    const d = hammingDistance((await hashImageBuffer(opaque))!, (await hashImageBuffer(transparent))!);
    expect(d).toBe(0);
  });
});

describe("bytes that are not a picture", () => {
  it("answers null rather than throwing", async () => {
    // Null is "we do not know", and every caller reads that as "allow".
    for (const junk of [
      Buffer.from("not an image at all"),
      Buffer.alloc(0),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), // a JPEG header and nothing else
    ]) {
      await expect(hashImageBuffer(junk)).resolves.toBeNull();
    }
  });
});

describe("isOwnStorageUrl", () => {
  const SUPA = "https://fyaioseridqabockidyp.supabase.co";

  it("accepts our own public objects", () => {
    expect(isOwnStorageUrl(`${SUPA}/storage/v1/object/public/post-images/u/1.jpg`, SUPA)).toBe(true);
  });

  it("refuses anywhere else, which is the whole point", () => {
    // The URLs come from a table a forged claim_media call can write to, so
    // this is what stands between a moderation job and being an SSRF tool.
    for (const bad of [
      "https://evil.example/x.jpg",
      "http://fyaioseridqabockidyp.supabase.co/storage/v1/object/public/a.jpg", // not https
      `${SUPA}/rest/v1/profiles`, // our host, not an object
      `${SUPA}/storage/v1/object/sign/private/secret.jpg`, // not the public path
      "https://fyaioseridqabockidyp.supabase.co.evil.example/storage/v1/object/public/a.jpg",
      "file:///etc/passwd",
      "http://169.254.169.254/latest/meta-data/",
      "not a url",
    ]) {
      expect(isOwnStorageUrl(bad, SUPA), bad).toBe(false);
    }
  });

  it("refuses everything when the project URL is not configured", () => {
    expect(isOwnStorageUrl(`${SUPA}/storage/v1/object/public/a.jpg`, undefined)).toBe(false);
  });
});
