import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  COLLAB_CAP,
  MAX_COLLAB_TITLE,
  canPostInto,
  collabTitleReady,
  contributorLine,
  hasRoom,
  memberState,
  tidyCollabTitle,
  type CollabMember,
} from "@/lib/show-collab";

/**
 * Shows several people build together.
 *
 * Phase 4's last piece, and the only item in the plan no competitor
 * has. The shape is deliberately the weaker of the two available: a
 * Show posted into a collab still belongs to whoever posted it, and
 * `collab_id` only says which shared reel it *also* appears in. A
 * collab that owned its Shows would make leaving either take your own
 * posts with it or not, and both answers are wrong.
 *
 * Dry-run against the live database inside a rolled-back transaction,
 * standing up the whole unapplied stack (0184 and 0186) first. All
 * sixteen outcomes were right: the title was tidied, the owner was a
 * member from the start, two invitations were raised and notified, a
 * stranger could not invite, a joined member saw a Hypers-only Show
 * posted into it, an invited-but-not-joined person did not, a stranger
 * did not, hidden-from and expiry each still beat membership, an
 * outsider could not post into it, leaving freed only that person's
 * own Shows and deleted none, and the owner leaving closed it and
 * freed every Show without deleting any.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0186_show_collabs.sql");
const view = read("src/components/shows/CollabView.tsx");
const route = read("src/app/(app)/shows/collab/[collabId]/page.tsx");
const viewerRoute = read("src/app/(app)/shows/[showId]/page.tsx");
const home = read("src/app/(app)/home/page.tsx");
const row = read("src/components/home/ShowsRow.tsx");
const preview = read("src/components/create/ShotPreview.tsx");
const notifications = read("src/app/(app)/notifications/page.tsx");
const grid = read("src/app/(app)/shows/page.tsx");

const member = (userId: string, joined: boolean): CollabMember => ({ userId, joined });

describe("a name, as the database will keep it", () => {
  it("collapses whitespace the way the function does", () => {
    // The title is drawn on one line over a cover, and sixty
    // characters of newline is a way to push everything else off it.
    expect(tidyCollabTitle("  Goa   trip  ")).toBe("Goa trip");
    expect(tidyCollabTitle("a\n\nb")).toBe("a b");
    expect(tidyCollabTitle("   ")).toBe("");
  });

  it("and is bounded where the column is", () => {
    expect(tidyCollabTitle("x".repeat(200))).toHaveLength(MAX_COLLAB_TITLE);
    expect(sql).toContain("char_length(title) <= 60");
  });

  it("so the composer can refuse an empty one without a round trip", () => {
    expect(collabTitleReady("   ")).toBe(false);
    expect(collabTitleReady("\n\t")).toBe(false);
    expect(collabTitleReady("Goa")).toBe(true);
  });
});

describe("where somebody stands with one", () => {
  it("the owner, a member, an invitation and a stranger are four things", () => {
    const people = [member("owner", true), member("in", true), member("asked", false)];
    expect(memberState("owner", people, "owner")).toBe("owner");
    expect(memberState("owner", people, "in")).toBe("member");
    expect(memberState("owner", people, "asked")).toBe("invited");
    expect(memberState("owner", people, "nobody")).toBe("outsider");
    expect(memberState("owner", people, null)).toBe("outsider");
  });

  it("and only the first two may post into it", () => {
    // Being added to something without saying yes would put a cover on
    // your ring you did not ask for and list you as a contributor to
    // whatever the others post, so joining is a step.
    expect(canPostInto("owner")).toBe(true);
    expect(canPostInto("member")).toBe(true);
    expect(canPostInto("invited")).toBe(false);
    expect(canPostInto("outsider")).toBe(false);
  });

  it("an invitation holds a place against the cap", () => {
    // Otherwise a collab can be filled past the cap by everybody
    // accepting at once.
    const full = Array.from({ length: COLLAB_CAP }, (_, i) => member(`p${i}`, i % 2 === 0));
    expect(hasRoom(full)).toBe(false);
    expect(hasRoom(full.slice(1))).toBe(true);
  });
});

describe("what the cover says underneath the name", () => {
  it("names while they fit, then a count", () => {
    expect(contributorLine([])).toBe("Nobody yet");
    expect(contributorLine(["Aman"])).toBe("Aman");
    expect(contributorLine(["Aman", "dnot"])).toBe("Aman and dnot");
    expect(contributorLine(["Aman", "dnot", "kurkure"])).toBe("Aman, dnot and 1 other");
    expect(contributorLine(["Aman", "dnot", "kurkure", "adhiraj"])).toBe("Aman, dnot and 2 others");
  });

  it("and an empty name is not a contributor", () => {
    expect(contributorLine(["", "  ", "Aman"])).toBe("Aman");
  });
});

describe("membership is a way in, not a way past everything", () => {
  it("it stands in for privacy and audience", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function public.can_see_show"),
      sql.indexOf("revoke all on function public.can_see_show"),
    );
    expect(fn).toContain("or (s.collab_id is not null");
    expect(fn).toContain("public.in_show_collab(s.collab_id, (select auth.uid()))");
  });

  it("but not for takedown, expiry or being hidden from somebody", () => {
    // "Not this person" is the author naming somebody, and it has to
    // beat every other way in or it means nothing.
    const fn = sql.slice(
      sql.indexOf("create or replace function public.can_see_show"),
      sql.indexOf("revoke all on function public.can_see_show"),
    );
    // The whole clause, stated exactly, rather than a slice starting
    // at show_hidden_from — a bypass inserted one line *above* that
    // string is invisible to such a slice, and a mutation proved it:
    // adding an in_show_collab alternative above the not-exists let
    // membership beat being hidden from somebody, and the test passed.
    expect(fn).toContain(
      `and (
         s.user_id = (select auth.uid())
         or not exists (select 1 from public.show_hidden_from h
                         where h.show_id = s.id and h.user_id = (select auth.uid()))
       )`,
    );
    const takedown = fn.slice(fn.indexOf("s.removed_at is null"), fn.indexOf("s.expires_at > now()"));
    expect(takedown).not.toContain("in_show_collab");
    const expiry = fn.slice(fn.indexOf("s.expires_at > now()"), fn.indexOf("or (s.collab_id is not null"));
    expect(expiry).not.toContain("in_show_collab");
  });

  it("and an invitation is not membership", () => {
    const fn = sql.slice(sql.indexOf("function public.in_show_collab"), sql.indexOf("revoke all on function public.in_show_collab"));
    expect(fn).toContain("m.joined_at is not null");
    expect(fn).toContain("c.removed_at is null");
  });
});

describe("posting into one", () => {
  it("is refused unless you have joined it", () => {
    // collab_id is a client-written column, so without this anybody
    // could post into anybody's shared Show by guessing an id — and a
    // collab is exactly a list of people who can see each other's
    // posts.
    expect(sql).toContain("create or replace function public.tg_shows_collab_is_yours()");
    expect(sql).toContain("if not public.in_show_collab(new.collab_id, new.user_id) then");
    expect(sql).toContain("raise exception 'You are not in that shared Show'");
  });

  it("and the check runs on an update of the column too, not only an insert", () => {
    // Otherwise a Show is created clean and moved into somebody's
    // collab a moment later.
    expect(sql).toContain("before insert or update of collab_id on public.shows");
  });

  it("the column is writable, which a new one is not by default", () => {
    expect(sql).toContain("mentions, layers, audience, collab_id)\n  on public.shows to authenticated;");
  });

  it("and the composer sends it", () => {
    expect(preview).toContain("collab_id: collabId ?? null,");
  });
});

describe("being in one", () => {
  it("the owner is a member from the start, with nothing to accept", () => {
    const fn = sql.slice(sql.indexOf("function public.create_show_collab"), sql.indexOf("revoke all on function public.create_show_collab"));
    expect(fn).toContain("values (v_id, v_me, v_me, now());");
  });

  it("anybody already in it can bring somebody in", () => {
    // Making the owner the only door turns it into their Show with
    // guests, which is the thing it is not.
    const fn = sql.slice(sql.indexOf("function public.invite_to_show_collab"), sql.indexOf("revoke all on function public.invite_to_show_collab"));
    expect(fn).toContain("if not public.in_show_collab(p_collab, v_me) then");
    expect(fn).toContain("raise exception 'You are not in this Show'");
  });

  it("an invitation is bounded, and never reaches somebody blocked", () => {
    const fn = sql.slice(sql.indexOf("function public.invite_to_show_collab"), sql.indexOf("revoke all on function public.invite_to_show_collab"));
    expect(fn).toContain("if v_count >= public.show_collab_cap() then");
    expect(fn).toContain("p_user in (select public.blocked_either_way())");
  });

  it("and a second invite from a second member is not a second notification", () => {
    const fn = sql.slice(sql.indexOf("function public.invite_to_show_collab"), sql.indexOf("revoke all on function public.invite_to_show_collab"));
    expect(fn).toContain("on conflict (collab_id, user_id) do nothing;");
    expect(fn).toContain("if found then");
  });

  it("joining is only possible for somebody who was asked", () => {
    const fn = sql.slice(sql.indexOf("function public.join_show_collab"), sql.indexOf("revoke all on function public.join_show_collab"));
    expect(fn).toContain("raise exception 'You were not invited to this Show'");
    // coalesce, so joining twice does not reset when you joined.
    expect(fn).toContain("set joined_at = coalesce(joined_at, now())");
  });

  it("the cap is one number, in the database, mirrored in the client", () => {
    // search_path pinned like every other function here: the
    // advisor flags any that is not, and a constant-returning one is
    // no reason to be the exception.
    expect(sql).toContain("returns int language sql immutable set search_path = public as $ select 20 $");
    expect(COLLAB_CAP).toBe(20);
  });
});

describe("leaving does not take your Shows with it", () => {
  it("a member frees only their own", () => {
    const fn = sql.slice(sql.indexOf("function public.leave_show_collab"), sql.indexOf("revoke all on function public.leave_show_collab"));
    expect(fn).toContain("update public.shows set collab_id = null where collab_id = p_collab and user_id = v_me;");
    expect(fn).not.toContain("delete from public.shows");
  });

  it("and the owner leaving closes it for everybody", () => {
    // A shared Show with nobody to own it is a thing nobody can
    // moderate or close.
    const fn = sql.slice(sql.indexOf("function public.leave_show_collab"), sql.indexOf("revoke all on function public.leave_show_collab"));
    expect(fn).toContain("update public.show_collabs set removed_at = now()");
    expect(fn).toContain("update public.shows set collab_id = null where collab_id = p_collab;");
  });

  it("which the screen says plainly before it happens", () => {
    expect(view).toContain("It closes for everybody in it. Nobody's Shows are deleted");
    expect(view).toContain("What you posted into it stays yours.");
  });
});

describe("one cover, opened", () => {
  it("the ring groups a shared Show apart from its author's own", () => {
    expect(home).toContain("const key = c?.id ? `collab:${c.id}` : s.user_id;");
    expect(home).toContain('name: c?.title ?? p?.display_name ?? p?.username ?? "User",');
    expect(home).toContain("shared: Boolean(c?.id),");
  });

  it("and it reaches members who do not follow the author", () => {
    // The ordinary ring query is follows-only. A member who does not
    // follow a contributor would otherwise never see what was posted
    // into the thing they joined, which is the whole feature.
    expect(home).toContain('.from("show_collab_members")');
    expect(home).toContain('.not("joined_at", "is", null)');
    expect(home).toContain('.in("collab_id", collabIds)');
  });

  it("a Show arriving from both queries is one bubble, not two", () => {
    expect(home).toContain("const seenShowIds = new Set<string>();");
    expect(home).toContain("if (seenShowIds.has(s.id)) return false;");
  });

  it("the bubble says it stands for several people", () => {
    expect(row).toContain("{s.shared && (");
    expect(row).toContain("<Users size={11} className=\"text-accent\" />");
  });

  it("and opening it plays the collab, not that one person's reel", () => {
    // The ring draws one cover standing for several people; opening it
    // and getting one person's reel would make the cover a lie.
    expect(viewerRoute).toContain("const { data: raw } = await (target.collab_id");
    expect(viewerRoute).toContain('reel.eq("collab_id", target.collab_id)');
    expect(viewerRoute).toContain('reel.eq("user_id", target.user_id).is("collab_id", null)');
  });

  it("so an author's own reel stops including what they put in a collab", () => {
    // Without the is(collab_id, null) their own bubble and the shared
    // one would both play the same Show.
    expect(viewerRoute).toContain('.is("collab_id", null)');
  });
});

describe("the screens around it", () => {
  it("a non-member gets the same answer as a missing one", () => {
    // "This does not exist" and "this is not yours" are the same
    // answer, and the policy already makes them the same query.
    expect(route).toContain('if (!collab) return <GoneScreen kind="show" />;');
  });

  it("the collab page offers posting only to people who may", () => {
    expect(view).toContain("{canPostInto(state) && (");
    expect(view).toContain("href={`/create?mode=show&collab=${collabId}`}");
  });

  it("an invitation is shown as one, with something to press", () => {
    expect(view).toContain('{state === "invited" && (');
    expect(view).toContain('rpc("join_show_collab"');
  });

  it("and the invite notification goes somewhere", () => {
    // Every new target_type lands on "#" until somebody adds it here.
    expect(notifications).toContain(
      'if (n.target_type === "show_collab" && n.target_id) return `/shows/collab/${n.target_id}`;',
    );
  });

  it("the Shows screen lists the ones you are in and the ones you were asked into", () => {
    expect(grid).toContain('.from("show_collab_members")');
    expect(grid).toContain('{c.joined ? "You\'re in it" : "You were asked to join"}');
  });
});
