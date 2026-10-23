import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The half that closes the bypass.
 *
 * The hash recorded at upload is what the client claimed, and a crafted
 * request can claim the hash of a different picture. This job refetches the
 * stored object, hashes the bytes here, and overwrites the row — after which
 * `verified` means something.
 *
 * The decoding itself is tested for real in media-hash-server.test.ts,
 * through actual JPEG, PNG and WebP. What this pins is the route's
 * judgement: what it fetches, what it refuses, and what it does NOT do.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const route = read("src/app/api/moderation/verify/route.ts");
const sql = read("supabase/migrations/0159_media_verification.sql");

describe("it cannot be used as a request forgery tool", () => {
  it("fetches only our own public storage objects", () => {
    // The URL comes from media_fingerprints, which a forged claim_media call
    // can write anything into. This check is the whole guard.
    expect(route).toContain("if (!isOwnStorageUrl(url)) return null;");
  });

  it("refuses redirects, which would walk straight past that check", () => {
    expect(route).toContain('redirect: "error"');
  });

  it("caps the download, by header and again by what arrived", () => {
    // content-length is a claim, and a missing one is common.
    expect(route).toContain("declared > MAX_DECODE_BYTES");
    expect(route).toContain("bytes.byteLength > MAX_DECODE_BYTES");
  });

  it("gives up on a slow object rather than hanging the batch", () => {
    expect(route).toContain("AbortController");
    expect(route).toContain("FETCH_TIMEOUT_MS");
  });
});

describe("it is not callable by a user", () => {
  it("is behind a shared secret, like the other cron routes", () => {
    expect(route).toContain('secretMatches(req.headers.get("x-moderation-secret")');
    expect(route).toContain("MODERATION_VERIFY_SECRET");
    expect(route).toContain('status: 401');
  });

  it("refuses to run unconfigured instead of half-working", () => {
    expect(route).toContain("if (!process.env.SUPABASE_SERVICE_ROLE_KEY)");
  });

  it("and neither function is reachable by anon or authenticated", () => {
    for (const fn of ["set_verified_hash(uuid, text)", "raise_media_report(text, uuid)"]) {
      expect(sql, fn).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
    }
  });
});

describe("it does not remove anything", () => {
  it("raises a report instead of deleting", () => {
    // A perceptual match is a judgement with a false-positive rate, and
    // wrongly deleting somebody's photo is the expensive direction.
    expect(route).toContain("raise_media_report");
    expect(route).not.toMatch(/removed_at|\.delete\(\)|admin_remove_content/);
  });

  it("and the flag says it has not been acted on", () => {
    expect(sql).toContain("Flagged by the upload check, not removed");
  });

  it("the flag reaches the queue a human already works", () => {
    expect(sql).toContain("insert into public.reports");
    // And it is labelled there as what it is, not as a missing reporter.
    expect(read("src/app/(app)/admin/reports/page.tsx")).toContain('"automated check"');
  });

  it("re-running the job does not pile up duplicate flags", () => {
    // Scoped to the statement, not the file: the phrase appears in the
    // comment above it too, and an assertion the prose can satisfy is one
    // the code can fail without anybody noticing. Found by mutating it.
    const insert = sql.slice(sql.indexOf("insert into public.reports"));
    expect(insert).toContain("on conflict do nothing");
    // And the partial index that gives that conflict something to hit.
    const index = sql.slice(sql.indexOf("create unique index"));
    expect(index.slice(0, 200)).toContain("where reporter_id is null");
  });
});

describe("one bad object cannot wedge the queue", () => {
  it("an object that will not decode is still marked verified", () => {
    // Otherwise the job picks the same row up on every run, forever, and
    // nothing behind it is ever checked.
    const body = route.slice(route.indexOf("if (!actual)"));
    expect(body.slice(0, 500)).toContain("verified: true");
  });

  it("and its hash is left as it was, not overwritten with nothing", () => {
    expect(sql).toContain("if bits is null then\n    update public.media_fingerprints set verified = true where id = p_id;");
  });

  it("the batch is bounded", () => {
    expect(route).toContain("const BATCH = 20;");
    expect(route).toContain(".limit(BATCH)");
    expect(route).toContain("export const maxDuration");
  });

  it("oldest first, so nothing starves", () => {
    expect(route).toContain('.order("created_at", { ascending: true })');
  });
});

describe("the server hash is the one that counts", () => {
  it("the row is overwritten with what the server computed", () => {
    expect(route).toContain('admin.rpc("set_verified_hash", { p_id: row.id, p_hash: actual })');
    expect(sql).toContain("set hash = bits, verified = true");
  });

  it("and the blocklist is consulted with that, not with what was claimed", () => {
    const body = route.slice(route.indexOf("checked++"));
    expect(body.slice(0, 300)).toContain('check_media", { p_hash: actual }');
  });
});
