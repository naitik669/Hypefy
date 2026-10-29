import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The reaper, read as SQL.
 *
 * Nothing has ever deleted a Show: no cron, no clause in the policy
 * before 0178, nothing in 0154's retention sweep. Every Show ever posted
 * is still a row and still a file in a bucket that takes 25 MB each.
 *
 * Dry-run against the live database inside a rolled-back transaction: of
 * 30 Shows past the thirty-day window it would take 28 and hold back 2 —
 * the one on a Showcase board and the one still carrying is_showcase.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0181_reap_expired_shows.sql");

describe("what the reaper will not touch", () => {
  it("a Show on a Showcase board", () => {
    expect(sql).toContain("from public.showcase_items si");
    expect(sql).toContain("where si.show_id = s.id");
    expect(sql).toContain("and si.removed_at is null");
  });

  it("a Show still carrying the old keep flag", () => {
    // 0068 declared is_showcase superseded and two code paths still write
    // it. It goes in Phase 4; until then it still means "keep".
    expect(sql).toContain("and coalesce(s.is_showcase, false) = false");
  });

  it("and anything inside the archive window", () => {
    expect(sql).toContain("s.expires_at <= now() - interval '30 days'");
  });
});

describe("how it behaves before anyone configures it", () => {
  it("does nothing at all rather than posting unauthenticated", () => {
    // Applying this before the Vault secret exists has to be safe.
    expect(sql).toContain("if v_secret is null then return; end if;");
    expect(sql).toContain("from vault.decrypted_secrets where name = 'show_reap_secret'");
  });

  it("and the secret is never written into the migration", () => {
    // notify_push_webhook hardcoded one, so that value is in this repo's
    // git history for ever.
    expect(sql).not.toMatch(/x-show-reap-secret'\s*,\s*'[^v]/);
  });
});

describe("the run is bounded", () => {
  it("oldest first, with a ceiling", () => {
    // The first run has years of backlog; a thousand HTTP posts out of
    // one transaction is its own outage.
    expect(sql).toContain("order by s.expires_at");
    expect(sql).toContain("limit 200");
  });
});

describe("the job is visible to the readiness check", () => {
  it("it joins the expected list in the same migration that creates it", () => {
    // 0167 exists because 0166 added a job and the list did not grow with
    // it. Doing both here means they cannot separate.
    expect(sql).toContain("select cron.schedule('reap-expired-shows'");
    expect(sql).toContain("function public.ops_readiness");
    expect(sql).toContain("'reap-expired-shows'\n  ];");
  });

  it("and the rest of the list is carried over intact", () => {
    for (const job of [
      "publish-scheduled-posts", "capture-creator-daily-stats", "reap-oneshots",
      "purge-expired-messages", "expire-lapsed-subscriptions", "remind-trials-ending",
      "send-hype-summaries", "prune-rate-events", "prune-retention",
      "verify-media-hashes", "deliver-scheduled-messages",
    ]) {
      expect(sql, job).toContain(`'${job}'`);
    }
  });
});
