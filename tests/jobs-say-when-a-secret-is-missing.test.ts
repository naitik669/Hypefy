import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A scheduled job that cannot do its work must not report success.
 *
 * `run_media_verification` has run every five minutes since it was added and
 * has never verified anything: it reads `moderation_verify_secret` from the
 * vault, that secret has never been set, and it returned at the check — with
 * no warning, and nothing in `net._http_response`, because it never got as
 * far as a request. pg_cron filed all 5,083 runs as successes. The only trace
 * was twelve media fingerprints sitting unverified for sixteen days.
 *
 * Second time this shape has cost weeks. The Shows reaper posts to the wrong
 * host, and its nightly 404s were also filed as successes, because a function
 * that queues through pg_net returns before anyone learns the answer.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0193_jobs_say_when_a_secret_is_missing.sql");

/** The body of one `create or replace function` in the migration. */
function body(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is not in the migration`).toBeGreaterThan(-1);
  const end = sql.indexOf("$fn$;", start);
  expect(end, `${name} has no terminator`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/** Every cron-driven job this migration restates. */
const JOBS = ["run_media_verification", "reap_oneshots", "send_hype_summaries"] as const;

describe("a job with no secret fails loudly", () => {
  it.each(JOBS)("%s raises rather than returning quietly", (name) => {
    const fn = body(name);
    expect(fn).toContain("if v_secret is null or v_secret = '' then");
    expect(fn).toContain("raise exception");
    // The whole bug: a bare `return` where the raise belongs.
    const guard = fn.slice(fn.indexOf("if v_secret is null"));
    expect(guard.slice(0, guard.indexOf("end if;"))).not.toContain("return;");
  });

  it.each(JOBS)("%s says what to do about it", (name) => {
    // An exception nobody can act on is only a different kind of dead end.
    expect(body(name)).toContain("using hint =");
  });

  it("and names both halves the secret needs, not just the vault", () => {
    // The vault value is the header the job sends; the Vercel value is what
    // /api/moderation/verify compares it against. One without the other is
    // still a 401.
    const fn = body("run_media_verification");
    expect(fn).toContain("MODERATION_VERIFY_SECRET");
    expect(fn).toContain("Vault");
  });

  it("the count of stuck rows is in the message, so the cost is visible", () => {
    const fn = body("run_media_verification");
    expect(fn).toContain("% media fingerprint(s) cannot be verified', v_waiting");
  });

  it("but having nothing to do is still quiet", () => {
    // Not every early return is a bug. No fingerprints waiting is a real
    // answer and must not raise 288 times a day.
    const fn = body("run_media_verification");
    const nothingToDo = fn.slice(fn.indexOf("if v_waiting = 0"), fn.indexOf("select decrypted_secret"));
    expect(nothingToDo).toContain("return;");
    expect(nothingToDo).not.toContain("raise");
  });
});

describe("the trigger is the exception, on purpose", () => {
  const fn = () => body("notify_push_webhook");

  it("warns instead of raising, because it must not block an insert", () => {
    // It fires on every notification insert. Raising would mean a missing
    // secret stopped the app recording notifications at all, which is much
    // worse than not pushing them.
    const guard = fn().slice(fn().indexOf("if v_secret is null"));
    const upToEnd = guard.slice(0, guard.indexOf("end if;"));
    expect(upToEnd).toContain("raise warning");
    expect(upToEnd).not.toContain("raise exception");
    expect(upToEnd).toContain("return new;");
  });

  it("and stops sending a request it knows will be refused", () => {
    // A null header is a guaranteed 401; the warning says why far more
    // clearly than a rejected POST.
    const guard = fn().slice(fn().indexOf("if v_secret is null"));
    expect(guard.slice(0, guard.indexOf("end if;"))).toContain("return new;");
  });
});

describe("what the migration deliberately does not do", () => {
  it("no helper hands a decrypted secret back to a caller", () => {
    // CREATE FUNCTION grants EXECUTE to PUBLIC by default, so a SECURITY
    // DEFINER function returning a secret is one careless blanket grant away
    // from giving every signed-in user every secret the app holds.
    expect(sql).not.toMatch(/create or replace function public\.\w*secret\w*\(/i);
    expect(sql.toLowerCase()).not.toContain("returns text");
  });

  it("leaves reap_expired_shows alone, so 0192 stays separable", () => {
    // It needs the same treatment, but its own fix is the wrong host, and
    // restating it here would carry that change in by the back door.
    expect(sql).not.toContain("reap_expired_shows()\nreturns");
    expect(sql).not.toContain("create or replace function public.reap_expired_shows");
    expect(sql).not.toContain("show_reap_secret");
  });

  it("and does not quietly change where anything posts", () => {
    // Every URL in here is the host the app is actually served from. The
    // reaper's www. mistake is the reason this is worth asserting.
    const urls = [...sql.matchAll(/url := '([^']+)'/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith("https://app.hypefy.chat/")).toBe(true);
  });
});

describe("every restated function keeps its hardening", () => {
  it.each([...JOBS, "notify_push_webhook"])("%s stays security definer with a pinned search_path", (name) => {
    const fn = body(name);
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public");
  });
});
