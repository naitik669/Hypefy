import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The loop that makes a takedown stick.
 *
 * Remove a picture and its hash joins the blocklist; the next attempt to post
 * it is refused without anybody looking. The behaviour itself was verified
 * against the live database inside a rolled-back transaction — all eight
 * steps of the loop, and every malformed input. What this file pins is the
 * parts of that which are easy to break later without noticing.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql157 = read("supabase/migrations/0157_media_fingerprints.sql");
const sql158 = read("supabase/migrations/0158_media_hash_text_api.sql");
const upload = read("src/components/upload/UploadProvider.tsx");

describe("the blocklist cannot be read", () => {
  it("neither table is reachable through the API", () => {
    // Anyone who can read the blocklist can test a picture against it offline
    // and nudge it until it passes. The only way in is a function that
    // answers one yes-or-no question.
    for (const t of ["blocked_media", "media_fingerprints"]) {
      expect(sql157, t).toContain(`revoke all on table public.${t} from anon, authenticated;`);
      expect(sql157, t).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("and the check leaks nothing beyond the answer", () => {
    // Not which entry matched, not how close — those are a gradient to climb.
    expect(sql157).toContain("returns boolean");
    expect(sql158).toContain("returns boolean");
    expect(sql157).not.toMatch(/returns setof|returns table/i);
  });
});

describe("a malformed hash never blocks an upload", () => {
  it("an unreadable hash answers false rather than raising", () => {
    // Raising would make a client bug look like a blocked picture and stop
    // someone posting. Verified live for uppercase hex, a truncated hash,
    // an empty string, null and SQL-ish junk — all false.
    expect(sql158).toContain("when public.media_hash_bits(p_hash) is null then false");
  });

  it("and writes no fingerprint, so nothing wrong is recorded", () => {
    const claim = sql158.slice(sql158.indexOf("create or replace function public.claim_media"));
    expect(claim).toContain("if bits is null then\n    return false;\n  end if;");
  });

  it("the shape is validated, because a short hash converts silently", () => {
    // ('x' || p_hash)::bit(64) on fifteen characters yields a DIFFERENT 64
    // bits rather than failing, so a truncated hash would be stored as a real
    // fingerprint and never match anything again.
    expect(sql158).toContain("p_hash ~ '^[0-9a-f]{16}$'");
  });
});

describe("the harvest loop", () => {
  const harvest = sql157.slice(sql157.indexOf("function public.tg_harvest_removed_media"));

  it("fires only on the way into removed", () => {
    // Otherwise every later update re-harvests.
    expect(harvest).toContain("if new.removed_at is null or old.removed_at is not null then");
  });

  it("restoring content does not unblock it", () => {
    // Un-blocking is a moderator deleting a blocklist row, never a side
    // effect of restoring a post. Verified live.
    expect(harvest).not.toContain("delete from public.blocked_media");
  });

  it("covers posts, Shots and comments", () => {
    for (const t of ["posts", "shots", "comments"]) {
      expect(sql157, t).toContain(`after update of removed_at on public.${t}`);
    }
  });
});

describe("the upload path", () => {
  it("checks before uploading, not after", () => {
    // A phone uplink takes a minute; refusing at the end wastes all of it.
    const body = upload.slice(upload.indexOf("const uploadPost"));
    expect(body.indexOf("check_media")).toBeLessThan(body.indexOf(".upload("));
  });

  it("a file that will not decode is let through, not refused", () => {
    // "We do not know" must never read as "refuse" — a decoder quirk would
    // otherwise stop someone posting their own photo.
    expect(upload).toContain("if (!hash) continue;");
    expect(read("src/lib/media-hash-client.ts")).toContain("Promise<string | null>");
  });

  it("the refusal does not describe the rule", () => {
    // Telling someone what matched is telling them what to change.
    expect(upload).toContain('toast("That image can\'t be posted.", "error")');
    // Every string the person could be shown, not every word in the file —
    // "hash" appears all over it as a variable name.
    for (const [, shown] of upload.matchAll(/toast\(\s*"([^"]+)"/g)) {
      expect(shown, shown).not.toMatch(/match|remov|block|hash|moderat/i);
    }
  });

  it("a fingerprint that fails to write does not fail the post", () => {
    // The post is live by then; a weaker blocklist later is not worth an
    // error in front of somebody.
    const fn = upload.slice(upload.indexOf("async function recordFingerprints"));
    expect(fn.slice(0, 900)).toContain("} catch {");
  });

  it("fingerprints are recorded against the created post", () => {
    expect(upload).toContain('.select("id")');
    expect(upload).toContain('recordFingerprints(supabase, "post", created.id, urls, hashes)');
  });
});

describe("the two thresholds cannot drift apart", () => {
  it("the database agrees with the client", () => {
    // The hash is computed in TS and compared in SQL. If these two numbers
    // ever differ, the check silently means something different from what
    // the measurement in media-hash.ts chose.
    const ts = /export const MATCH_DISTANCE = (\d+);/.exec(read("src/lib/media-hash.ts"));
    const pg = /create or replace function public\.media_match_distance\(\)[\s\S]*?select (\d+)/.exec(sql157);
    expect(ts?.[1]).toBeDefined();
    expect(pg?.[1]).toBeDefined();
    expect(pg![1]).toBe(ts![1]);
  });
});
