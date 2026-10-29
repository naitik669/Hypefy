import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHOW_AUDIENCES, isRestricted, readAudience } from "@/lib/show-audience";

/**
 * Who a Show goes to, who it is kept from, and what happens to it after.
 *
 * Phase 4's first three pieces. The rule itself is one function in the
 * database — 0183 pulled it into can_see_show precisely so the SELECT
 * policy and the SECURITY DEFINER RPCs could not drift, and 0184 adds
 * the two new clauses there rather than in a second place.
 *
 * Dry-run against the live database inside rolled-back transactions,
 * with a seeded author, a Hyper and a stranger. Every cell came out
 * right: the author saw all three Shows including the one they had
 * hidden from somebody; the Hyper saw the open one and the Hypers-only
 * one but not the one hidden from them; the stranger saw the open ones
 * and not the Hypers-only one; signed out saw only the open one. The
 * CHECK refused an audience of 'nobody', and every existing row
 * defaulted to 'everyone'.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0184_show_audience.sql");
const retire = read("supabase/migrations/0185_retire_is_showcase.sql");
const bar = read("src/components/shows/ShowAudienceBar.tsx");
const picker = read("src/components/diary/AudiencePicker.tsx");
const preview = read("src/components/create/ShotPreview.tsx");
const row = read("src/components/home/ShowsRow.tsx");
const grid = read("src/app/(app)/shows/page.tsx");
const reap = read("src/app/api/shows/reap/route.ts");
const viewer = read("src/components/shows/ShowViewer.tsx");

describe("the audience, as a value", () => {
  it("is two things and reads unknown as the open one", () => {
    // A text column with a CHECK can still hold a row written by a
    // newer client, and that must not take a page down.
    expect([...SHOW_AUDIENCES]).toEqual(["everyone", "hypers"]);
    expect(readAudience("hypers")).toBe("hypers");
    expect(readAudience("everyone")).toBe("everyone");
    expect(readAudience("nobody")).toBe("everyone");
    expect(readAudience(null)).toBe("everyone");
    expect(readAudience(undefined)).toBe("everyone");
    expect(readAudience(7)).toBe("everyone");
  });

  it("and 'narrower than everybody' is asked as one question", () => {
    // The ring and the grid both want this rather than the value, so a
    // third audience later lights the same ring instead of needing
    // finding again.
    expect(isRestricted("hypers")).toBe(true);
    expect(isRestricted("everyone")).toBe(false);
    expect(isRestricted("nonsense")).toBe(false);
  });
});

describe("the rule lives in one function", () => {
  it("both new clauses are inside can_see_show", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function public.can_see_show"),
      sql.indexOf("revoke all on function public.can_see_show"),
    );
    expect(fn).toContain("or s.audience = 'everyone'");
    expect(fn).toContain("from public.close_friends c");
    expect(fn).toContain("from public.show_hidden_from h");
  });

  it("and the policy is untouched, because it already calls that function", () => {
    // 0183 made shows_select_public read can_see_show(id). Adding an
    // audience clause to the policy as well would be the drift that
    // change existed to prevent.
    expect(sql).not.toContain("alter policy");
  });

  it("the author is exempt from both, and no new power is handed to an admin", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function public.can_see_show"),
      sql.indexOf("revoke all on function public.can_see_show"),
    );
    const audience = fn.slice(fn.indexOf("-- Who it was posted to."), fn.indexOf("-- And who it was taken away from."));
    const hidden = fn.slice(fn.indexOf("-- And who it was taken away from."));
    expect(audience).toContain("s.user_id = (select auth.uid())");
    expect(hidden).toContain("s.user_id = (select auth.uid())");
    expect(audience).not.toContain("is_admin");
    expect(hidden).not.toContain("is_admin");
  });

  it("the column is bounded, and defaults to the open room", () => {
    expect(sql).toContain("check (audience in ('everyone', 'hypers'))");
    expect(sql).toContain("add column if not exists audience text not null default 'everyone'");
  });

  it("and it is writable, which a new column is not by default", () => {
    // 0150 revoked column-wide writes. A column nobody granted is a
    // column the client cannot set, silently.
    expect(sql).toContain("mentions, layers, audience)\n  on public.shows to authenticated;");
    expect(sql).toContain("grant update (is_showcase, layers, audience) on public.shows to authenticated;");
  });
});

describe("the list of people left out is the one thing they must not read", () => {
  it("the author alone can select it", () => {
    const policy = sql.slice(sql.indexOf(`create policy "hidden from: the author's own list"`));
    expect(policy.slice(0, 300)).toContain("select s.user_id from public.shows s");
  });

  it("and can only write it against a Show that is theirs", () => {
    const insert = sql.slice(sql.indexOf(`create policy "hidden from: only on your own Show"`));
    expect(insert.slice(0, 300)).toContain("with check");
    expect(insert.slice(0, 300)).toContain("select s.user_id from public.shows s");
  });

  it("letting somebody back in is a delete they are allowed", () => {
    expect(sql).toContain(`create policy "hidden from: and you can let them back in"`);
    expect(sql).toContain("grant select, insert, delete on public.show_hidden_from to authenticated;");
  });
});

describe("a mention has to lead somewhere", () => {
  it("nobody is told about a Show they cannot open", () => {
    // Telling somebody they were mentioned in a Show they cannot read
    // is worse than not telling them: it names it, implies they can
    // see it, and ends on an empty screen.
    const fn = retire.length >= 0 ? sql.slice(sql.indexOf("function public.handle_show_mentions")) : "";
    expect(fn).toContain("new.audience = 'everyone'");
    expect(fn).toContain("from public.close_friends c");
    expect(fn).toContain("from public.show_hidden_from h");
  });
});

describe("choosing the room, on the screen where it is posted", () => {
  it("the Show composer has the control and the Shot one does not", () => {
    expect(preview).toContain('{mode === "show" && (');
    expect(preview).toContain("<ShowAudienceBar");
  });

  it("the picker is Diary's, taught a second set of words", () => {
    // Two copies of this menu saying the same thing differently is the
    // kind of pair where the one nobody is looking at drifts.
    expect(bar).toContain('import { AudiencePicker, type AudienceOption } from "@/components/diary/AudiencePicker";');
    expect(picker).toContain("export type AudienceOption<T extends string> = {");
    // It styles the narrow room from a flag rather than from the
    // literal "close", which is Diary's value and not this one's.
    expect(picker).not.toContain('value === "close" ? "fill-accent');
    expect(picker).toContain("current.narrow ?");
  });

  it("the exclusion list is drawn from the room, and prunes when the room narrows", () => {
    // A hidden-from entry for somebody who cannot see it anyway is a
    // promise about nothing.
    // Scoped to the query: `audience === "hypers"` also decides the
    // sheet's wording further down, so a file-wide check passed with
    // the branch that picks the table reverted to a constant.
    const load = bar.slice(bar.indexOf("const load = useCallback"), bar.indexOf("}, [supabase, userId, audience]);"));
    expect(load).toContain('audience === "hypers"');
    expect(load).toContain('.from("close_friends")');
    expect(load).toContain('.from("follows")');
    expect(load).toContain('.eq("following_id", userId)');
    expect(bar).toContain("const inRoom = new Set(room.map((p) => p.id));");
    expect(bar).toContain("const kept = hidden.filter((id) => inRoom.has(id));");
    // Who is in the room is kept beside which room they were read for,
    // so "still loading" is derived rather than written by clearing the
    // list inside the effect — which is a setState during render by
    // another name, and the lint rule that catches it is right.
    expect(bar).toContain("const people = found?.room === audience ? found.people : null;");
  });

  it("and a failure to write the exclusions takes the Show back down", () => {
    // A row there is a promise. Publishing without it leaves the Show
    // standing in front of somebody it was meant to be kept from.
    const publish = preview.slice(preview.indexOf('.from("shows").insert({'));
    expect(publish).toContain('await supabase.from("shows").delete().eq("id", row.id);');
    expect(publish).toContain('toast("Couldn\'t set who it\'s hidden from. Nothing was posted.");');
  });

  it("the exclusions are written only once there is a Show to point at", () => {
    const publish = preview.slice(preview.indexOf('.from("shows").insert({'));
    expect(publish).toContain('.select("id")');
    expect(publish).toContain("show_id: row.id");
  });
});

describe("a narrower room looks like one before it is opened", () => {
  it("the ring goes gold", () => {
    expect(row).toContain('isSeen ? "" : s.restricted ? "bg-hype" : "bg-accent"');
  });

  it("but seen still wins, because that is the ring's first job", () => {
    const start = row.indexOf("{/* Seen is grey");
    const ring = row.slice(start, row.indexOf("<span", start));
    expect(ring).toContain('style={isSeen ? { background: "#3a3a3a" } : undefined}');
    // The gold is reached only when it is not seen.
    expect(ring).toContain('isSeen ? "" : s.restricted');
  });

  it("one narrow Show colours the person's whole ring", () => {
    const home = read("src/app/(app)/home/page.tsx");
    expect(home).toContain("restricted: isRestricted(s.audience),");
    expect(home).toContain("existing.restricted ||= isRestricted(s.audience);");
    // The select grew a collab embed in 0186, and there are now two
    // of them — the follows query and the collab query. Both must
    // carry the audience, because the ring's colour is read from it.
    // Asserted as a count: a toContain was satisfied by the second
    // select while the first had lost the column, and a mutation
    // proved it.
    const needle =
      '"id, user_id, audience, collab_id, collab:show_collabs(id, title), profiles!shows_user_id_fkey';
    expect(home.split(needle)).toHaveLength(3);
  });

  it("and the grid labels only the narrow ones", () => {
    // "Everyone" on nearly every tile is a label that stops being read,
    // and then the one that matters is not read either.
    expect(grid).toContain("{isRestricted(s.audience) && (");
    expect(grid).not.toContain('badge="Everyone"');
  });
});

describe("the archive, and is_showcase stepping down", () => {
  it("everything that has been and gone is listed, not only what was flagged", () => {
    expect(grid).toContain("const archive = all.filter((s) => s.expires_at <= nowIso);");
    expect(grid).not.toContain("s.is_showcase);");
  });

  it("and it says whose it is and how long it has", () => {
    expect(grid).toContain("Only you can see these. They go for good after {SHOW_ARCHIVE_DAYS} days.");
  });

  it("every flagged Show is moved onto a board before anything stops reading the flag", () => {
    expect(retire).toContain("insert into public.showcase_items (showcase_id, kind, show_id, position)");
    expect(retire).toContain("where coalesce(s.is_showcase, false)");
    // A 'show' item carries the id alone; the first draft wrote
    // media_url and caption too and showcase_items_source refused it.
    expect(retire).not.toContain("kind, show_id, media_url, caption, position");
  });

  it("the drop is a separate migration, deliberately later", () => {
    // A DROP COLUMN cannot be undone and has no business running in the
    // same breath as the change that makes it safe.
    expect(retire).not.toContain("drop column");
    expect(retire).toContain("safe to drop");
    // Not numbered on purpose: the next number belongs to whatever
    // ships next, not to a reservation.
    expect(retire).toContain("It is not numbered here on purpose");
  });

  it("keeping a Show means putting it on a board", () => {
    expect(viewer).toContain('import { keepShow, unkeepShow } from "@/lib/show-keep";');
    expect(viewer).not.toContain(".update({ is_showcase: next })");
  });

  it("and the reaper asks the boards, which is what the policy asks", () => {
    expect(reap).not.toContain("if (show.is_showcase) {");
    expect(reap).toContain('.eq("show_id", showId)');
    expect(reap).toContain('return NextResponse.json({ error: "on a board" }, { status: 409 });');
  });
});

describe("hype, where it is the app's own verb", () => {
  it("the burst fires on the Show", () => {
    // The keyframes have been in globals.css since the feed got them;
    // this screen was the one place nothing fired them.
    expect(viewer).toContain('import { HypeParticles } from "@/components/feed/HypeParticles";');
    expect(viewer).toContain("{hypeBurst && <HypeParticles size={11} />}");
    expect(viewer).toContain('hypeBurst ? "animate-hype-burst" : ""');
  });

  it("but not on the way out", () => {
    // Taking a hype back is a correction; celebrating it reads as the
    // opposite of what happened.
    const toggle = viewer.slice(viewer.indexOf("async function toggleShowHype()"), viewer.indexOf("finally {"));
    expect(toggle).toContain("if (!prev) {");
    expect(toggle).toContain("setHypeBurst(true);");
  });
});

describe("what else was still reading the retired flag", () => {
  /**
   * Found by asking the database rather than the repo.
   *
   * The first draft of 0185 changed the API route and said "nothing
   * reads the flag". Two database functions still did —
   * reap_expired_shows and notify_show_posted — so dropping the column
   * on that claim would have taken the nightly reaper down with it.
   */
  it("the reaper's own query no longer filters on it", () => {
    // Bounded to the function body: the slice to end-of-file picked
    // up a later comment that names the flag, and the test failed on
    // prose rather than on SQL.
    const fn = retire.slice(
      retire.indexOf("create or replace function public.reap_expired_shows"),
      retire.indexOf("revoke execute on function public.reap_expired_shows"),
    );
    expect(fn).not.toContain("is_showcase");
    // The board check already covers every Show the flag protected,
    // because this migration put them all on one.
    expect(fn).toContain("from public.showcase_items si");
  });

  it("and neither does the posted-a-Show notification", () => {
    const fn = retire.slice(retire.indexOf("create or replace function public.notify_show_posted"));
    expect(fn).not.toContain("is_showcase");
  });

  it("which while being restated stops telling people about Shows they cannot open", () => {
    // A hole carried since 0184: that migration fixed exactly this for
    // mentions and nobody checked the other notification path, so a
    // Hypers-only Show told every follower and a Show hidden from
    // somebody told that exact person.
    const fn = retire.slice(retire.indexOf("create or replace function public.notify_show_posted"));
    expect(fn).toContain("new.audience = 'everyone'");
    expect(fn).toContain("from public.close_friends c");
    expect(fn).toContain("from public.show_hidden_from h");
  });

  it("without losing the throttle or the block check it already had", () => {
    const fn = retire.slice(retire.indexOf("create or replace function public.notify_show_posted"));
    expect(fn).toContain("now() - interval '6 hours'");
    expect(fn).toContain("from public.blocked_users b");
    expect(fn).toContain("p.notif_prefs -> 'shows_posted' = 'true'::jsonb");
  });

  it("and both stay off the client's reach", () => {
    expect(retire).toContain("revoke execute on function public.reap_expired_shows() from public, anon, authenticated;");
    expect(retire).toContain("revoke execute on function public.notify_show_posted() from public, anon, authenticated;");
  });
});
