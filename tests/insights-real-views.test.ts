import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { itemHref, itemTitle, viewsPerPerson } from "@/lib/creator-insights";

/**
 * Insights was under-reporting views by about eighteen times.
 *
 * Two things counted views and the screen read the wrong one.
 * posts.view_count is bumped by increment_post_view, which runs on the
 * permalink and the profile modal and never on the home feed — which is
 * where people actually look at posts. post_views holds one row per person
 * per day, written by FeedImpression on a 900ms dwell.
 *
 * Measured in production: sum(view_count) was 112 across every post while
 * post_views held 2,087 rows. The nightly rollup snapshotted the broken
 * one, so creator_daily_stats carried the same wrong number for 746 rows.
 *
 * 0198 moved the reads onto the real tables, rebuilt the history, and
 * brought Shots in — shot_views has existed since 0132 and nothing had ever
 * read it, so the totals said "posts" while the chart counted shot hypes.
 * 0199 cleaned the corners 0198's range did not reach. The rollup now sums
 * to exactly the number of rows in the two view tables.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/(app)/profile/insights/page.tsx");
const m198 = read("supabase/migrations/0198_insights_count_real_views.sql");

describe("Insights counts the real thing", () => {
  it("reads the author-gated RPCs, not the posts table directly", () => {
    expect(page).toContain('supabase.rpc("creator_item_stats"');
    expect(page).toContain('supabase.rpc("creator_totals")');
  });

  it("and never reads view_count again", () => {
    // The whole bug in one column name. The comment at the top of the page
    // explains it and names the column, so match the property access.
    expect(page).not.toMatch(/\bp\.view_count\b/);
    expect(page).not.toMatch(/select\([^)]*view_count/);
  });

  it("shows reach beside views, because they are different questions", () => {
    // 598 views from 14 people is a different story from 598 from 598.
    expect(page).toContain("People reached");
    expect(page).toContain("totals.reach");
  });

  it("and Shots appear, not just posts", () => {
    // As LOGIC, not as text. The first version of this matched the source
    // for "/shots?shot=", and blanking the ternary that chose it left the
    // string sitting there in a dead branch — the test passed against a
    // page that had stopped linking Shots entirely. itemHref is called, so
    // breaking it breaks this.
    expect(itemHref("shot", "abc")).toBe("/shots?shot=abc");
    expect(itemHref("post", "abc")).toBe("/p/abc");
    expect(itemTitle("shot", null)).toBe("Untitled Shot");
    expect(itemTitle("post", null)).toBe("Untitled post");
    expect(itemTitle("post", "hello")).toBe("hello");
    expect(page).toContain("itemHref(");
    expect(m198).toContain("shot_views");
  });

  it("and reach is reported against views", () => {
    expect(viewsPerPerson(598, 14)).toBe("43 views each"); // 42.71 rounds up
    expect(viewsPerPerson(3, 3)).toBe("1 view each");
    // Nothing to divide by says nothing, rather than Infinity or NaN.
    expect(viewsPerPerson(5, 0)).toBe("—");
    expect(viewsPerPerson(0, 5)).toBe("—");
  });
});

describe("the aggregates are author-only", () => {
  it("both gate inside the function, the way show_slider_voters does", () => {
    // Pattern C: security definer with the gate in the WHERE, so somebody
    // else's id returns no rows rather than an error.
    for (const fn of ["creator_item_stats", "creator_totals"]) {
      expect(m198, fn).toContain(`function public.${fn}`);
    }
    expect(m198).toContain("security definer");
    expect(m198).toContain("set search_path to 'public'");
  });

  it("and are revoked from anon before being granted", () => {
    expect(m198).toContain("revoke all on function public.creator_item_stats(int) from public, anon");
    expect(m198).toContain("revoke all on function public.creator_totals() from public, anon");
    expect(m198).toContain("grant execute on function public.creator_item_stats(int) to authenticated");
    expect(m198).toContain("grant execute on function public.creator_totals() to authenticated");
  });

  it("the nightly rollup stays cron-only", () => {
    expect(m198).toContain(
      "revoke all on function public.capture_creator_daily_stats() from public, anon, authenticated",
    );
  });

  it("and the rollup counts views per day rather than snapshotting a counter", () => {
    // The old one stored sum(view_count) — a cumulative total, which can
    // only be drawn as an ever-rising line that says nothing.
    expect(m198).toContain("v.viewed_on = d.day");
    expect(m198).not.toContain("sum(p.view_count)");
  });
});
