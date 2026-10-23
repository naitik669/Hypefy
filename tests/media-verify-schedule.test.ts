import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The cron job that drives verification.
 *
 * Installed active, and doing nothing at all until somebody sets the secret.
 * That combination is the point: a scheduled job that cannot succeed fails
 * silently every five minutes forever, and the noise sits exactly where a
 * real failure would have been visible.
 *
 * Both guards were proven against the live database before this was applied —
 * with no work pending, and with work pending but no secret, the pg_net queue
 * stayed at zero in each case.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0160_media_verification_schedule.sql");
const fn = sql.slice(sql.indexOf("create or replace function public.run_media_verification"));

describe("it posts nothing until it can work", () => {
  it("returns early when the secret is not set", () => {
    expect(fn).toContain("if v_secret is null or v_secret = '' then\n    return;");
  });

  it("returns early when there is nothing to verify", () => {
    // An idle app should not make 288 pointless requests a day.
    expect(fn).toContain("if not exists (select 1 from public.media_fingerprints where not verified) then");
  });

  it("checks for work before reaching for the secret", () => {
    // The cheap check first, and the one that costs a vault decrypt second.
    expect(fn.indexOf("where not verified")).toBeLessThan(fn.indexOf("decrypted_secrets"));
  });

  it("asks whether any row exists rather than counting them all", () => {
    expect(fn).toContain("not exists (select 1");
    expect(fn).not.toMatch(/select count\(\*\)[\s\S]*media_fingerprints/);
  });
});

describe("the secret is not in the migration", () => {
  it("comes from the Vault, like reap_oneshots and unlike notify_push_webhook", () => {
    expect(fn).toContain("from vault.decrypted_secrets");
    expect(fn).toContain("where name = 'moderation_verify_secret'");
  });

  it("and no literal secret is baked into the file", () => {
    // notify_push_webhook hardcoded one and it is in git history forever.
    expect(sql).not.toMatch(/'[0-9a-f]{32,}'/);
  });
});

describe("the job itself", () => {
  it("is scheduled, and named so it can be found", () => {
    expect(sql).toContain("'verify-media-hashes'");
    expect(sql).toContain("'*/5 * * * *'");
  });

  it("is not callable by a user", () => {
    expect(sql).toContain("revoke all on function public.run_media_verification() from public, anon, authenticated;");
  });

  it("points at the production route", () => {
    expect(fn).toContain("https://app.hypefy.chat/api/moderation/verify");
    expect(fn).toContain("'x-moderation-secret', v_secret");
  });
});

describe("the deploy step is written down", () => {
  const docs = read("docs/BACKEND.md");

  it("the job is listed with the other cron jobs", () => {
    expect(docs).toContain("| `verify-media-hashes` |");
  });

  it("and the secret setup is spelled out, both halves", () => {
    // Two independent copies; nothing in the database can check they match.
    expect(docs).toContain("moderation_verify_secret");
    expect(docs).toContain("MODERATION_VERIFY_SECRET");
  });

  it("including what is still forgeable until it is done", () => {
    expect(docs).toContain("which a crafted request can\nforge");
  });
});
