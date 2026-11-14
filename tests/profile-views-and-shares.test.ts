import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 2.2 and 2.3: two things nobody was recording.
 *
 * Profile views were not recorded anywhere in any form, so a creator could
 * see what a post did and nothing about the page the post sends people to
 * — the page that turns a view into a follow.
 *
 * And posts.share_count was inferred entirely from DM sends:
 * bump_share_count() fires on a messages insert of kind post or shot. So
 * copying a link, using the system share sheet, sending to WhatsApp and
 * putting something in a Show all counted as nothing, and the one number
 * called "shares" meant "times someone sent this in a Hypefy DM".
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const m205 = read("supabase/migrations/0205_profile_views_and_real_shares.sql");
const m206 = read("supabase/migrations/0206_new_tables_join_the_sweep.sql");
const ping = read("src/components/profile/ProfileViewPing.tsx");
const sheet = read("src/components/feed/ShareSheet.tsx");
const page = read("src/app/(app)/u/[username]/page.tsx");

describe("profile views", () => {
  it("are one row per visitor per day, not per page load", () => {
    // A profile refreshed forty times in an afternoon is one visitor.
    expect(m205).toContain("primary key (profile_id, viewer_id, viewed_on)");
    expect(m205).toContain("on conflict (profile_id, viewer_id, viewed_on) do nothing");
  });

  it("never count your own", () => {
    // The most common profile view there is, and the least interesting.
    expect(m205).toContain("p_profile_id = v_me then return");
    expect(m205).toContain("check (profile_id <> viewer_id)");
  });

  it("are written from the client, because a server render is a prefetch", () => {
    // Next prefetches links in the viewport, which on a feed is every
    // author whose post you scrolled past.
    expect(ping).toContain('"use client"');
    expect(ping).toContain('supabase.rpc("record_profile_view"');
    expect(page).toContain("<ProfileViewPing profileId={profile.id} />");
  });

  it("and the author is told how many, never who", () => {
    // "Who looked at your profile" changes how it feels to look at one.
    // The viewer id is in the row because counting distinct visitors needs
    // it, and for no other reason.
    const stats = m205.slice(
      m205.indexOf("function public.profile_view_stats"),
      m205.indexOf("revoke all on function public.profile_view_stats")
    );
    expect(stats).toContain("count(distinct v.viewer_id)");
    expect(stats).not.toContain("username");
    expect(stats).not.toContain("profiles");
  });

  it("the client cannot write the table directly", () => {
    expect(m205).toContain("revoke all on public.profile_views from authenticated");
    expect(m205).toContain("grant select on public.profile_views to authenticated");
    expect(m205).not.toMatch(/grant insert[^;]*profile_views/);
  });
});

describe("shares that actually happened", () => {
  it("every destination in the sheet is recorded", () => {
    // Before this, only the DM branch counted — through a trigger on the
    // messages table, not through the share button at all.
    for (const d of ["copy", "native", "whatsapp", "show", "dm"]) {
      expect(sheet, d).toContain(`noteShare("${d}")`);
    }
    expect(sheet).toContain('supabase.rpc("record_share"');
  });

  it("a dismissed system sheet is not a share", () => {
    // navigator.share rejects when the viewer backs out, and counting that
    // would make the number meaningless in the one direction people check.
    const fn = sheet.slice(sheet.indexOf("async function shareElsewhere"));
    const body = fn.slice(0, fn.indexOf("await copyLink();"));
    expect(body.indexOf('noteShare("native")')).toBeLessThan(body.indexOf("} catch {"));
  });

  it("and a DM is counted only once the send succeeded", () => {
    // By position, not by proximity. The first version matched "the guard,
    // then a noteShare within 400 chars", which stayed true when a second
    // noteShare was added BEFORE the guard — the call that would count
    // every failed send. What matters is that none appears before it.
    const fn = sheet.slice(sheet.indexOf("const { error: sendErr }"));
    const guard = fn.indexOf("if (sendErr) return false;");
    const firstNote = fn.indexOf('noteShare("dm")');
    expect(guard).toBeGreaterThan(-1);
    expect(firstNote).toBeGreaterThan(guard);
  });

  it("the destination list is closed, so a crafted call cannot write free text", () => {
    // The column gets grouped by, so arbitrary strings from a browser are
    // not merely untidy.
    expect(m205).toContain("if v_dest not in ('copy', 'native', 'whatsapp', 'show', 'dm', 'other')");
    expect(m205).toContain("v_dest := 'other'");
  });

  it("and a bad target type is dropped rather than stored", () => {
    expect(m205).toContain("if p_target_type not in ('post', 'shot', 'show', 'profile') then return");
  });

  it("the breakdown is for the owner of the thing shared", () => {
    const fn = m205.slice(m205.indexOf("function public.share_breakdown"));
    expect(fn).toContain("p.user_id = (select auth.uid())");
    expect(fn).toContain("s.user_id = (select auth.uid())");
    expect(fn).toContain("w.user_id = (select auth.uid())");
  });
});

describe("both tables expire", () => {
  it("they are in the retention sweep", () => {
    // 0154 set the rule at 180 days. A table created after it and left out
    // becomes the one place that history lives for ever — and a record of
    // who looked at whom is exactly the kind that should expire on a
    // schedule rather than because somebody remembered.
    expect(m206).toContain("delete from public.profile_views");
    expect(m206).toContain("delete from public.share_events");
    expect(m206).toContain("keep_days constant int := 180");
  });

  it("and the sweep still covers everything it covered before", () => {
    // prune_retention is replaced wholesale each time, so a rewrite that
    // forgets a table silently stops pruning it.
    for (const t of ["post_views", "shot_views", "shot_watch_stats", "notifications"]) {
      expect(m206, t).toContain(`delete from public.${t}`);
    }
  });
});
