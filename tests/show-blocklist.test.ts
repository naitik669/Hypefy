import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { publishFailureMessage } from "@/lib/show-publish";

/**
 * A Show is checked against the blocklist, and harvested when taken down.
 *
 * 0157 wired the perceptual-hash blocklist to posts, shots, comments and
 * messages. Shows were left out of the two links in the middle while every
 * other link already handled them: reports accept 'show' (0048) and
 * admin_remove_content maps it to the shows table (0055). So a picture a
 * moderator removed from a post could be put straight back up as a Show,
 * and taking that Show down taught the blocklist nothing.
 *
 * This is a safety guarantee, so the assertions are deliberately about the
 * calls being made rather than about any string being present: a check that
 * is not called is the whole failure mode.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** Comments stripped, so prose about a check cannot pass for the check. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const publish = code("src/lib/show-publish.ts");
const showcase = code("src/components/showcase/ShowcaseEditor.tsx");
const m = read("supabase/migrations/0214_shows_join_the_blocklist.sql");

describe("a Show is checked before it is stored", () => {
  it("the hash is taken and asked about", () => {
    expect(publish).toContain("hashImageFile(fingerprintOf)");
    expect(publish).toContain('supabase.rpc("check_media", { p_hash: hash })');
  });

  it("and a match refuses the publish rather than warning about it", () => {
    expect(publish).toContain('return { ok: false, reason: "blocked" }');
  });

  it("before a single byte is uploaded", () => {
    // Refusing after the upload would mean a minute on a phone uplink and
    // an object left in the bucket.
    const checkAt = publish.indexOf('rpc("check_media"');
    const uploadAt = publish.indexOf(".upload(path, d.file");
    expect(checkAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(uploadAt);
  });

  it("a photo Show is hashed as itself and a video one by its poster", () => {
    // Hashing a whole clip is video fingerprinting, a different problem.
    // The poster is a real frame and the image people see in a grid.
    expect(publish).toContain("const fingerprintOf = isVideoFile(d.file) ? poster : d.file;");
  });

  it("and nothing is refused on a hash that could not be taken", () => {
    // Null means "we do not know" — an undecodable file, a clip with no
    // poster. Refusing an upload over a decoder quirk is far worse than a
    // miss, which is what the post path settled long ago.
    expect(publish).toContain("const hash = fingerprintOf ? await hashImageFile(fingerprintOf) : null;");
    expect(publish).toContain("if (hash) {");
    // Counted, and tied to the branch it belongs in. Asserting the shape
    // of the guard alone passes against a file that has grown a SECOND
    // refusal above it for the null case, which is exactly the harm:
    // somebody's photo rejected because a decoder tripped.
    const refusals = publish.match(/reason: "blocked"/g) ?? [];
    expect(refusals).toHaveLength(1);
    const at = publish.indexOf('reason: "blocked"');
    expect(publish.slice(at - 60, at)).toContain("if (blocked)");
  });

  it("and what somebody is told does not describe the rule", () => {
    // Naming the rule is how a person works out what to change to get
    // round it. Same wording the post path uses.
    const said = publishFailureMessage("blocked");
    expect(said).toBe("That can't be posted.");
    expect(said.toLowerCase()).not.toContain("match");
    expect(said.toLowerCase()).not.toContain("removed");
    expect(said.toLowerCase()).not.toContain("blocklist");
  });

  it("while the other failures still say what went wrong", () => {
    // A blanket message for every reason would be the cheap way to pass
    // the test above.
    expect(publishFailureMessage("upload")).toContain("connection");
    expect(publishFailureMessage("prompt")).toContain("Add yours");
    expect(publishFailureMessage("hidden")).toContain("hidden from");
    expect(publishFailureMessage("insert")).toBe("Couldn't publish that. Try again.");
  });
});

describe("and fingerprinted once it is up", () => {
  it("against the Show, so a takedown has something to harvest", () => {
    expect(publish).toContain('p_target_type: "show"');
    expect(publish).toContain("p_target_id: row.id");
  });

  it("keyed to the object the hash actually describes", () => {
    // The poster for a video Show, not the clip: the hash is of the frame.
    expect(publish).toContain("p_url: posterUrl ?? mediaUrl");
  });

  it("and it can never fail the publish", () => {
    // The Show is live by the time this runs. A fingerprint that does not
    // write is a weaker blocklist later, not an error worth showing.
    const at = publish.indexOf('rpc("claim_media"');
    expect(at).toBeGreaterThan(-1);
    const after = publish.slice(at, at + 400);
    expect(after).toContain("catch {");
    const before = publish.slice(Math.max(0, at - 200), at);
    expect(before).toContain("try {");
  });

  it("after the Show exists, not before", () => {
    // claim_media takes the row id, so there is nothing to claim against
    // until the insert has returned one.
    const insertAt = publish.indexOf('.from("shows")');
    expect(publish.indexOf('rpc("claim_media"')).toBeGreaterThan(insertAt);
  });
});

describe("the migration opens exactly the two links that were shut", () => {
  it("the table accepts a Show fingerprint", () => {
    expect(m).toContain("check (target_type in ('post', 'shot', 'show', 'comment', 'message'))");
  });

  it("and so does the function, which has its own list", () => {
    // Two lists, and the table's is no use if the function refuses first.
    expect(m).toContain("if p_target_type not in ('post', 'shot', 'show', 'comment', 'message') then");
    expect(m).toContain("raise exception 'unknown target type'");
  });

  it("the guard is still a guard", () => {
    // Dropping the check instead of widening it would pass every assertion
    // above about 'show' being allowed.
    const dropAt = m.indexOf("drop constraint");
    const addAt = m.indexOf("add constraint media_fingerprints_target_type_check");
    expect(dropAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(dropAt);
  });

  it("and a removed Show harvests its hashes", () => {
    expect(m).toMatch(/create trigger shows_harvest_removed_media/);
    expect(m).toContain("after update of removed_at on public.shows");
    expect(m).toContain("tg_harvest_removed_media('show')");
  });

  it("Showcases are left out on purpose, and the reason is written down", () => {
    // Not an oversight: a Showcase cannot be removed by a moderator, so a
    // fingerprint on one would be evidence for a takedown that cannot
    // happen. If that changes, this is the line to come back to.
    expect(m).not.toContain("'showcase'");
    expect(m.toLowerCase()).toContain("showcase");
  });
});

describe("a Showcase upload is still checked", () => {
  it("because check_media needs no row of its own", () => {
    expect(showcase).toContain('supabase.rpc("check_media"');
    expect(showcase).toContain("hashImageFile(p.file)");
  });

  it("before anything is stored", () => {
    const checkAt = showcase.indexOf('rpc("check_media"');
    const uploadAt = showcase.indexOf(".upload(path, p.file");
    expect(checkAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(uploadAt);
  });

  it("and a match creates no board at all", () => {
    // The board is inserted after the uploads, so returning here leaves
    // nothing behind — which is the point of checking first.
    const checkAt = showcase.indexOf('rpc("check_media"');
    const boardAt = showcase.indexOf('.from("showcases")');
    expect(checkAt).toBeLessThan(boardAt);
    expect(showcase.slice(checkAt, boardAt)).toContain("return;");
    // The live form of the guard, not just a return somewhere after the
    // check: `if (false) { … return; }` keeps every string above it.
    expect(showcase).toContain("if (blocked) {");
  });

  it("photos only, since no poster is captured for a Showcase clip", () => {
    expect(showcase).toContain('if (p.kind !== "upload" || p.isVideo) continue;');
  });

  it("but no fingerprint is claimed, matching the migration's reasoning", () => {
    expect(showcase).not.toContain("claim_media");
  });
});

describe("and the content type it stores is one a browser will play", () => {
  it("the base type, not the codec string", () => {
    // Raw file.type on a recorded clip is "video/webm;codecs=vp9,opus",
    // which is stored as the content type and then served as a type no
    // browser will play. The exact bug video-mime.ts was written to fix,
    // still live in this file until now.
    expect(showcase).toContain("contentType: uploadContentType(p.file)");
    expect(showcase).not.toContain("contentType: p.file.type");
  });
});
