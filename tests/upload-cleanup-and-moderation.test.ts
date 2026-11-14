import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { uploadFailureMessage, worthRetrying } from "@/lib/upload-error";

/**
 * Phase 4, the correctness and safety half.
 *
 * Three things were wrong with the upload path and none of them produced
 * an error anybody saw:
 *
 *   A post of four photos that died on the fourth left three in the bucket
 *   for ever. Nothing referenced them, so nothing would ever clean them
 *   up, and a retry wrote three more. publishShow has removed its object
 *   on failure since it was written; the post and Shot paths never did.
 *
 *   The Shot path ran no blocklist check at all. check_media and
 *   claim_media (0157) are called only from uploadPost, and
 *   recordFingerprints has taken "post" | "shot" since it was written —
 *   the Shot half was simply never called. A picture taken down for good
 *   reason could come back as the cover of a clip.
 *
 *   Both catch blocks were bare, so a file over the bucket ceiling, a
 *   dropped socket and a permission refusal all said "Couldn't share your
 *   post" — three problems, three different things to do, one message
 *   suggesting none of them.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const up = read("src/components/upload/UploadProvider.tsx");

describe("saying what went wrong", () => {
  it("names the one failure somebody can actually act on", () => {
    for (const e of [
      { statusCode: "413" },
      new Error("Payload too large"),
      "The object exceeded the maximum allowed size",
    ]) {
      expect(uploadFailureMessage(e)).toMatch(/too large/i);
    }
  });

  it("tells a dropped connection apart from a refused file", () => {
    expect(uploadFailureMessage(new Error("Failed to fetch"))).toMatch(/connection/i);
    expect(uploadFailureMessage(new Error("Load failed"))).toMatch(/connection/i);
    expect(uploadFailureMessage(new Error("request timed out"))).toMatch(/connection/i);
  });

  it("and does not blame the file for a permission problem", () => {
    const m = uploadFailureMessage(new Error("new row violates row-level security policy"));
    expect(m).not.toMatch(/too large|file type/i);
    expect(m).toMatch(/sign/i);
  });

  it("uses the right noun for a Shot", () => {
    expect(uploadFailureMessage(new Error("boom"), "Shot")).toContain("your Shot");
    expect(uploadFailureMessage(new Error("boom"), "post")).toContain("your post");
  });

  it("shrugs honestly at anything it does not recognise", () => {
    // A confident wrong diagnosis sends somebody off to fix a thing that is
    // not broken.
    expect(uploadFailureMessage(new Error("something odd"))).toBe("Couldn't share your post");
    expect(uploadFailureMessage(null)).toBe("Couldn't share your post");
    expect(uploadFailureMessage(undefined)).toBe("Couldn't share your post");
    expect(uploadFailureMessage({})).toBe("Couldn't share your post");
  });

  it("and only offers a retry where one could work", () => {
    // A retry on a file that is too big offers a second identical failure.
    expect(worthRetrying(new Error("Payload too large"))).toBe(false);
    expect(worthRetrying({ statusCode: "413" })).toBe(false);
    expect(worthRetrying(new Error("mime type not allowed"))).toBe(false);
    expect(worthRetrying(new Error("Failed to fetch"))).toBe(true);
    expect(worthRetrying(new Error("who knows"))).toBe(true);
  });
});

describe("a failed upload takes its files back out", () => {
  it("there is one helper, used by both paths", () => {
    expect(up).toContain("async function discardUploaded(");
    expect((up.match(/await discardUploaded\(supabase, stored\)/g) ?? [])).toHaveLength(2);
  });

  it("the post path records every object it stores", () => {
    expect(up).toContain('stored.push({ bucket: "post-images", path })');
  });

  it("and the Shot path records the clip AND the poster", () => {
    // A poster that uploaded before the insert failed is an orphan too.
    expect(up).toContain('stored.push({ bucket: "shot-media", path })');
    expect(up).toContain('stored.push({ bucket: "shot-media", path: posterPath })');
  });

  it("with the list declared where the catch can see it", () => {
    // Declared inside the try it would be out of scope in exactly the place
    // it is needed, which is how this was written the first time.
    const decls = [...up.matchAll(/const stored: \{ bucket: string; path: string \}\[\] = \[\];/g)];
    expect(decls).toHaveLength(2);
    for (const m of decls) {
      // From the END of the declaration to the next `try {`. Slicing from
      // the start instead included the declaration's own type annotation,
      // whose braces made the first version of this fail.
      const from = (m.index ?? 0) + m[0].length;
      const after = up.slice(from);
      const tryAt = after.indexOf("try {");
      expect(tryAt).toBeGreaterThan(-1);
      const between = after
        .slice(0, tryAt)
        .replace(/^\s*\/\/.*$/gm, "")
        .trim();
      expect(between, "something sits between the declaration and the try").toBe("");
    }
  });

  it("and cleanup never throws over a failure it is already handling", () => {
    const fn = up.slice(up.indexOf("async function discardUploaded"));
    const body = fn.slice(0, fn.indexOf("export function UploadProvider"));
    expect(body).toContain("try {");
    expect(body).toContain("catch {");
  });
});

describe("a Shot is checked against the blocklist", () => {
  it("before the clip is uploaded, not after", () => {
    // Refusing after a 50MB upload on a phone uplink wastes the upload.
    const checkAt = up.indexOf('supabase.rpc("check_media", { p_hash: posterHash })');
    const uploadAt = up.indexOf('.from("shot-media")');
    expect(checkAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(uploadAt);
  });

  it("on the poster, which is the frame people actually see", () => {
    expect(up).toContain("const posterHash = poster ? await hashImageFile(poster) : null");
  });

  it("and a clip with no poster is let through, not blocked", () => {
    // A null hash means "we do not know". The post path already decided
    // that reads as let it through: refusing over a decoder quirk is worse
    // than a miss.
    expect(up).toContain("if (posterHash) {");
  });

  it("then fingerprinted once the row exists", () => {
    // recordFingerprints has accepted "shot" since it was written and was
    // never called with it.
    expect(up).toContain('recordFingerprints(supabase, "shot", createdShot.id');
  });

  it("which needs the insert to return an id", () => {
    expect(up).toContain('.select("id").single()');
  });
});

describe("both paths say something specific now", () => {
  it("no bare catch is left in either", () => {
    const bare = up.match(/\}\s*catch\s*\{\s*\n\s*stopTrickle\(\);/g) ?? [];
    expect(bare, "a catch that cannot see what failed").toEqual([]);
  });

  it("and the message comes from the mapping, not a literal", () => {
    expect(up).toContain('uploadFailureMessage(err, "post")');
    expect(up).toContain('uploadFailureMessage(err, "Shot")');
    expect(up).not.toContain('toast("Couldn\'t share your post", "error")');
    expect(up).not.toContain('toast("Couldn\'t post your Shot", "error")');
  });
});
