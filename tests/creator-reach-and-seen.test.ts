import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 1: the signals that existed and nothing read, and one number I got
 * wrong an hour earlier.
 *
 * ── reach was adding two counts of people ───────────────────────────────
 *
 * 0198 computed distinct viewers of your posts, distinct viewers of your
 * Shots, and added them, so anyone who saw both was counted twice. Four
 * authors were overstated the moment it shipped, the worst by six people.
 * A number whose whole job is to be smaller and truer than views cannot be
 * a sum of two overlapping sets. 0201 takes it off one distinct set.
 *
 * ── already-watched Shots kept coming back ──────────────────────────────
 *
 * shot_views has recorded what you watched since 0132. feed-rank.ts said in
 * a comment that the table did not exist and hard-coded seen = false, and
 * the Shots tab's own scorer had no seen term at all. Both read it now.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const rank = read("src/lib/feed-rank.ts");
const home = read("src/app/(app)/home/page.tsx");
const shots = read("src/app/(app)/shots/page.tsx");
const m201 = read("supabase/migrations/0201_reach_is_people_not_sums.sql");
const m200 = read("supabase/migrations/0200_declare_the_stats_cron.sql");

describe("reach counts people once", () => {
  it("off a single distinct set, not two added together", () => {
    // The union is the fix. Two counts added is the bug.
    expect(m201).toContain("people as (");
    expect(m201).toMatch(/select distinct v\.viewer_id[\s\S]*union[\s\S]*select distinct v\.viewer_id/);
  });

  it("and the split is counted off that same set, so it always adds up", () => {
    // following + new = reach is a property of counting both from `people`,
    // not something asserted separately and hoped for.
    expect(m201).toContain("count(*) as reach");
    expect(m201).toContain("count(*) filter (");
    expect(m201).toContain("'reach_new',      (select reach - from_followers from split)");
  });

  it("while views stays a sum, because views really are additive", () => {
    // Same person on three days is three views and one person. That is the
    // entire distinction the two numbers exist to draw.
    expect(m201).toMatch(/views as \([\s\S]*count\(\*\)[\s\S]*\+/);
  });

  it("and the page shows the split rather than making you divide", () => {
    const page = read("src/app/(app)/profile/insights/page.tsx");
    expect(page).toContain("reach_following");
    expect(page).toContain("ReachSplit");
  });
});

describe("what you already watched stops being re-served", () => {
  it("the stale comment denying shot_views is gone", () => {
    // It claimed "there is no shot_views table" while 0132 had created it
    // and recordWatch had been writing to it the whole time.
    expect(rank).not.toContain("there is no shot_views table");
  });

  it("shotFeedScore takes seen and passes it through", () => {
    expect(rank).toMatch(/interacted = false,\s*\n\s*seen = false/);
    // The call into feedScore ended in a hard-coded `false` for seen.
    expect(rank).toMatch(/interacted,\s*\n\s*seen\s*\n\s*\);/);
  });

  it("home reads shot_views and feeds it in", () => {
    expect(home).toContain('.from("shot_views")');
    expect(home).toContain("watchedShotIds.has(s.id)");
  });

  it("and the Shots tab penalises a watched reel", () => {
    // This one had no seen term at all, which is where it bit hardest:
    // the dedicated reel feed re-served the same Shots indefinitely.
    expect(shots).toContain('.from("shot_views")');
    expect(shots).toContain("WATCHED_PENALTY");
    expect(shots).toContain("watched ? WATCHED_PENALTY : 0");
  });

  it("but not so hard that an empty reel is preferred to a repeat", () => {
    const penalty = Number(shots.match(/WATCHED_PENALTY = (\d+)/)?.[1]);
    expect(penalty).toBeGreaterThan(0);
    // Below the engagement ceiling (60), so a genuinely popular Shot you
    // have seen can still outrank a dud you have not.
    expect(penalty).toBeLessThan(60);
  });
});

describe("the nightly job is declared, not just alive", () => {
  it("the schedule lives in a migration now", () => {
    // It ran in production for months while existing in no migration: 0029
    // left the cron.schedule call commented out and somebody scheduled it
    // by hand. Rebuild from migrations and it was silently absent.
    // Anchored to a real statement, not the substring: the comment above it
    // explains the history and says "cron.schedule" while doing so, so
    // toContain passed against a version where the call was commented out.
    expect(m200).toMatch(/^\s*select cron\.schedule\(/m);
    expect(m200).toMatch(/^\s*'capture-creator-daily-stats',/m);
    expect(m200).toMatch(/^\s*'10 0 \* \* \*',/m);
  });
});
