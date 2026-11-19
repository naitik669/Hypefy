import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  notifTarget,
  webHref,
  parseWebHref,
  pushTarget,
  NOTIF_TARGET_KINDS,
  type NotifTarget,
} from "../packages/core/src/notif-target";
import {
  groupNotifs,
  actorSummary,
  shownNotifs,
  hasNoActor,
  levelKeyOf,
  MUTE_EXEMPT,
  NEVER_GROUP,
  GROUP_WINDOW_MS,
} from "../packages/core/src/notif-group";
import { needsYou } from "../packages/core/src/activity-prefs";
import { PUSH_CHANNEL_ID } from "../packages/core/src/push-channel";
import { mobileRoute, elsewhere, REACHABLE } from "../apps/mobile/src/notifications/route";
import {
  mediaThumb,
  postThumb,
  loadNotifs,
  unreadCount,
  markRead,
  readAll,
  withThumbs,
  NOTIF_COLUMNS,
  PAGE,
  type NotifRow,
} from "../apps/mobile/src/notifications/load";
import { platformName } from "../apps/mobile/src/notifications/platform";

const read = (p: string) => readFileSync(p, "utf8");

/** The plain column names in a select, ignoring the embedded join. */
const plainColumns = (select: string) =>
  select
    .replace(/[\w!:]+\([^)]*\)/g, "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^\w+$/.test(c));

/** Comments AND imports stripped: both have stood in for code here before. */
const body = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, "");

const SCREEN = "apps/mobile/app/notifications.tsx";
const LOAD = "apps/mobile/src/notifications/load.ts";
const ROUTE = "apps/mobile/src/notifications/route.ts";
const PUSH = "apps/mobile/src/notifications/push.ts";
const TAPS = "apps/mobile/src/notifications/taps.ts";
const BELL = "apps/mobile/src/notifications/Bell.tsx";
const NUDGE = "apps/mobile/src/notifications/PushNudge.tsx";
const TOPBAR = "apps/mobile/src/TopBar.tsx";
const ROOT = "apps/mobile/app/_layout.tsx";
const WEB_PAGE = "src/app/(app)/notifications/page.tsx";
const WEB_PUSH_ROUTE = "src/app/api/push/route.ts";
const FCM = "src/lib/fcm.ts";

const n = (over: Partial<NotifRow> = {}): NotifRow => ({
  id: "n1",
  type: "hype_post",
  target_type: "post",
  target_id: "p1",
  actor_id: "a1",
  body: "hyped your post",
  is_read: false,
  created_at: "2026-11-19T10:00:00Z",
  actor: { display_name: "Aman", username: "aman", avatar_hue: 200, avatar_url: null },
  ...over,
});

/* ------------------------------------------------------------------ *
 * The place, not the path                                            *
 * ------------------------------------------------------------------ */

describe("a notification names a place, which each client routes itself", () => {
  /*
   * The reason this is not a URL string. The website returned one, which
   * worked while there was one client; the phone has three of these places
   * and would otherwise be matching patterns to work out what it had been
   * handed — and a pattern nobody added becomes a row that looks tappable
   * and does nothing, which is what the website's own comment on this logic
   * is about, three times over.
   */
  it("every kind round-trips through the website's path", () => {
    const samples: NotifTarget[] = [
      { kind: "profile", username: "aman" },
      { kind: "post", id: "p1" },
      { kind: "post-comment", postId: "p1", commentId: "c1" },
      { kind: "shot", id: "s1" },
      { kind: "show", id: "w1" },
      { kind: "show-answers", id: "w1" },
      { kind: "show-collab", id: "k1" },
      { kind: "conversation", id: "v1" },
      { kind: "calls" },
      { kind: "diary" },
      { kind: "spotlight", page: "g1" },
      { kind: "spotlight", page: null },
      { kind: "library" },
      { kind: "security" },
      { kind: "subscription" },
      { kind: "activity" },
      { kind: "none" },
    ];
    for (const t of samples) {
      expect(parseWebHref(webHref(t)), `${webHref(t)} did not come back as ${t.kind}`).toEqual(t);
    }
    // And the samples cover every kind there is, so adding one to core
    // fails here until it has been round-tripped.
    expect([...new Set(samples.map((t) => t.kind))].sort()).toEqual([...NOTIF_TARGET_KINDS].sort());
  });

  it("a security alert is about the account, not about a person", () => {
    expect(notifTarget(n({ type: "security_alert", target_type: null, target_id: null }))).toEqual({
      kind: "security",
    });
  });

  it("all four person notifications go to the person", () => {
    for (const type of ["follow", "follow_request", "follow_accepted", "referral_joined"]) {
      expect(notifTarget(n({ type, target_type: "profile" })), type).toEqual({
        kind: "profile",
        username: "aman",
      });
    }
  });

  it("and a person with no username has nowhere to go rather than /u/null", () => {
    expect(notifTarget(n({ type: "follow", actor: null }))).toEqual({ kind: "none" });
  });

  it("a call opens the conversation, falling back to the log", () => {
    expect(notifTarget(n({ type: "missed_call", target_type: "conversation", target_id: "v1" })))
      .toEqual({ kind: "conversation", id: "v1" });
    expect(notifTarget(n({ type: "incoming_call", target_type: null, target_id: null }))).toEqual({
      kind: "calls",
    });
  });

  it("an answered question sticker opens the answers, not the Show", () => {
    // Its target_type IS "show", so the order of these two branches is the
    // whole behaviour: the Show is the one screen that cannot show you the
    // answer.
    expect(notifTarget(n({ type: "show_answer", target_type: "show", target_id: "w1" }))).toEqual({
      kind: "show-answers",
      id: "w1",
    });
    expect(notifTarget(n({ type: "hype_show", target_type: "show", target_id: "w1" }))).toEqual({
      kind: "show",
      id: "w1",
    });
  });

  it("a comment needs its parent resolved, and says nowhere until it is", () => {
    expect(notifTarget(n({ target_type: "comment", target_id: "c1" }))).toEqual({ kind: "none" });
    expect(
      notifTarget(n({ target_type: "comment", target_id: "c1", parent: { kind: "post", id: "p1" } })),
    ).toEqual({ kind: "post-comment", postId: "p1", commentId: "c1" });
    // A comment on a Shot lands on the Shot: there is no comment anchor there.
    expect(
      notifTarget(n({ target_type: "comment", target_id: "c1", parent: { kind: "shot", id: "s1" } })),
    ).toEqual({ kind: "shot", id: "s1" });
  });
});

/* ------------------------------------------------------------------ *
 * What the phone can actually open                                   *
 * ------------------------------------------------------------------ */

describe("a row this app cannot open is not made tappable", () => {
  it("every kind core can produce has been decided about", () => {
    // The point of the closed union. A new place in core fails here until
    // somebody says what the phone does with it — rather than silently
    // defaulting to nowhere.
    for (const kind of NOTIF_TARGET_KINDS) {
      const t = { kind, username: "u", id: "i", postId: "p", commentId: "c", page: null } as never;
      const route = mobileRoute(t);
      const expected = (REACHABLE as readonly string[]).includes(kind);
      expect(route !== null, `${kind} is ${route ? "reachable" : "not reachable"}`).toBe(expected);
    }
  });

  it("the three it has, with the routes that exist", () => {
    expect(mobileRoute({ kind: "profile", username: "aman" })).toEqual({
      pathname: "/u/[username]",
      params: { username: "aman" },
    });
    expect(mobileRoute({ kind: "conversation", id: "v1" })).toEqual({
      pathname: "/messages/[id]",
      params: { id: "v1" },
    });
    expect(mobileRoute({ kind: "post-comment", postId: "p1", commentId: "c1" })).toEqual({
      pathname: "/post/[id]/comments",
      params: { id: "p1" },
    });
    expect(mobileRoute({ kind: "activity" })).toEqual({ pathname: "/notifications" });
  });

  it("and each of those route files exists", () => {
    for (const p of [
      "apps/mobile/app/u/[username].tsx",
      "apps/mobile/app/messages/[id].tsx",
      "apps/mobile/app/post/[id]/comments.tsx",
      SCREEN,
    ]) {
      expect(existsSync(p), `${p} is routed to and does not exist`).toBe(true);
    }
  });

  it("'on the web' is said only where there IS somewhere", () => {
    // A milestone or a sign-in alert has no destination anywhere. Telling
    // somebody to go and look for one is worse than saying nothing.
    expect(elsewhere({ kind: "none" })).toBe(false);
    expect(elsewhere({ kind: "shot", id: "s1" })).toBe(true);
    expect(elsewhere({ kind: "show", id: "w1" })).toBe(true);
    expect(elsewhere({ kind: "post", id: "p1" })).toBe(true);
    expect(elsewhere({ kind: "profile", username: "a" })).toBe(false);
  });

  it("the screen renders a View, not a disabled Pressable", () => {
    const src = body(SCREEN);
    // A disabled button still announces itself as a button and still
    // flashes under a finger. Both say "this does something".
    expect(src).toMatch(/if \(!route\) \{[\s\S]*?return <View style=\{\[styles\.row/);
    expect(src).not.toMatch(/disabled=\{!route\}/);
  });

  it("and says where the thing is", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/\{onWeb && \(/);
    expect(src).toMatch(/Open this on the web/);
    expect(src).toMatch(/elsewhere\(g\.target\)/);
  });
});

/* ------------------------------------------------------------------ *
 * Grouping, shared                                                   *
 * ------------------------------------------------------------------ */

describe("grouping is the website's, not a second answer", () => {
  it("the phone calls core rather than sorting or counting itself", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/groupNotifs<NotifRow, NotifActor>\(visible\)/);
    expect(src).toMatch(/shownNotifs\(notifs \?\? \[\], prefs\)/);
    // Twice, not once: the needs list and the remainder have to use the
    // same question, and asserting it appears "somewhere" stayed green
    // while one of the two had been replaced by `!g.isRead`.
    expect(src.match(/needsYou\(g\.type, g\.isRead\)/g)).toHaveLength(2);
    expect(src).toMatch(/sectionOf\(g\.latestAt\)/);
    // No local copy of any of it.
    expect(src).not.toMatch(/actorCount \+= 1/);
    expect(src).not.toMatch(/GROUP_WINDOW/);
  });

  it("and so does the website, from the same module", () => {
    const web = read(WEB_PAGE);
    expect(web).toMatch(/from "@hypefy\/core\/notif-group"/);
    expect(web).toMatch(/coreGroupNotifs<Notif, NonNullable<Notif\["actor"\]>>\(list\)/);
    expect(web).toMatch(/href: webHref\(g\.target\)/);
    // The copies are gone, not merely unused.
    expect(web).not.toMatch(/const GROUP_WINDOW_MS/);
    expect(web).not.toMatch(/const NEVER_GROUP/);
    expect(web).not.toMatch(/function actorSummary/);
  });

  it("counts distinct accounts, so two people with one display name are two", () => {
    const rows = [
      n({ id: "1", actor_id: "x", actor: { display_name: "Sam", username: null, avatar_hue: 1, avatar_url: null } }),
      n({ id: "2", actor_id: "y", actor: { display_name: "Sam", username: null, avatar_hue: 1, avatar_url: null } }),
      n({ id: "3", actor_id: "z", actor: { display_name: "Sam", username: null, avatar_hue: 1, avatar_url: null } }),
    ];
    const [g] = groupNotifs(rows);
    expect(g.actorCount).toBe(3);
    expect(actorSummary(g)).toBe("Sam and 2 others");
  });

  it("and the summary reads differently at one, two and more", () => {
    /*
     * Three sentences, not one rule. Asserting only the "and N others"
     * form left the two-person case uncovered, and a group of two then
     * read "Aman and 1 other" - naming somebody and then declining to,
     * which is the one count where every name fits.
     */
    const g = (...names: string[]) => ({
      actors: names.map((display_name) => ({ display_name, username: null })),
      actorCount: names.length,
    });
    expect(actorSummary(g("Aman"))).toBe("Aman");
    expect(actorSummary(g("Aman", "Leo"))).toBe("Aman and Leo");
    expect(actorSummary(g("Aman", "Leo", "Nia"))).toBe("Aman and 2 others");
    expect(actorSummary(g("Aman", "Leo", "Nia", "Jay"))).toBe("Aman and 3 others");
    // Nobody at all still says something rather than rendering blank.
    expect(actorSummary({ actors: [], actorCount: 0 })).toBe("Someone");
  });

  it("windows a group, so today's follow is not summed with last month's", () => {
    const old = new Date(Date.parse("2026-11-19T10:00:00Z") - GROUP_WINDOW_MS - 1000).toISOString();
    const rows = [
      n({ id: "1", type: "follow", target_type: "profile", target_id: "me", actor_id: "x" }),
      n({ id: "2", type: "follow", target_type: "profile", target_id: "me", actor_id: "y", created_at: old }),
    ];
    const groups = groupNotifs(rows);
    expect(groups).toHaveLength(2);
  });

  it("never collapses the kinds where a second row is the information", () => {
    for (const type of NEVER_GROUP) {
      const rows = [
        n({ id: "1", type, target_type: "post", target_id: "same", actor_id: "x" }),
        n({ id: "2", type, target_type: "post", target_id: "same", actor_id: "y" }),
      ];
      expect(groupNotifs(rows), type).toHaveLength(2);
    }
  });

  it("nor the ones that carry words somebody wrote", () => {
    const rows = [
      n({ id: "1", type: "comment_post", target_type: "post", target_id: "same", actor_id: "x" }),
      n({ id: "2", type: "mention_post", target_type: "post", target_id: "same", actor_id: "y" }),
      n({ id: "3", type: "comment_post", target_type: "post", target_id: "same", actor_id: "z" }),
    ];
    expect(groupNotifs(rows)).toHaveLength(3);
  });

  it("a group is unread if any of its rows is", () => {
    const rows = [
      n({ id: "1", is_read: true, actor_id: "x" }),
      n({ id: "2", is_read: false, actor_id: "y" }),
    ];
    expect(groupNotifs(rows)[0].isRead).toBe(false);
  });

  it("and takes the first still it finds, so a group is not blank", () => {
    const rows = [
      n({ id: "1", actor_id: "x", thumb: null }),
      n({ id: "2", actor_id: "y", thumb: { url: "pic.jpg" } }),
    ];
    expect(groupNotifs(rows)[0].thumb).toEqual({ url: "pic.jpg" });
  });

  it("a group carries a place, not a path — the phone has no use for /p/x", () => {
    const [g] = groupNotifs([n()]);
    expect(g.target).toEqual({ kind: "post", id: "p1" });
  });
});

describe("what needs an answer is not just what is unread", () => {
  /*
   * The behavioural half of the assertion above, and the reason "unread"
   * is not a synonym for "needs you". A follow request you have already
   * SEEN is still a question nobody has answered — `!isRead` drops it out
   * of the section whose whole job is to carry it, and an unread hype is
   * not a question at all.
   */
  it("a follow request you have already seen still needs you", () => {
    expect(needsYou("follow_request", true)).toBe(true);
    expect(needsYou("follow_request", false)).toBe(true);
  });

  it("while an unread hype does not", () => {
    expect(needsYou("hype_post", false)).toBe(false);
    expect(needsYou("comment_post", false)).toBe(true);
    expect(needsYou("comment_post", true)).toBe(false);
  });
});

describe("the Tune sheet is obeyed even though it is not offered", () => {
  it("a level set to off hides what arrived before the change", () => {
    const rows = [n({ id: "h", type: "hype_post" }), n({ id: "c", type: "comment_post" })];
    expect(shownNotifs(rows, { hypes: false }).map((r) => r.id)).toEqual(["c"]);
  });

  it("a rehype answers to its own level, not to hypes", () => {
    expect(levelKeyOf("repost")).toBe("rehypes");
    expect(levelKeyOf("hype_post")).toBe("hypes");
  });

  it("a muted person still reaches you where it matters", () => {
    const muted = { muted: ["m"] };
    for (const type of MUTE_EXEMPT) {
      expect(shownNotifs([n({ id: "k", type, actor_id: "m" })], muted), type).toHaveLength(1);
    }
    expect(shownNotifs([n({ id: "k", type: "hype_post", actor_id: "m" })], muted)).toHaveLength(0);
  });

  it("the phone reads the preferences from the same RPC the website does", () => {
    expect(body(SCREEN)).toMatch(/rpc\("my_private_profile"\)/);
    expect(body(SCREEN)).toMatch(/parsePrivateProfile\(me\.data\)\?\.notifPrefs/);
  });

  it("nobody did a milestone, a sign-in alert or a trial reminder", () => {
    for (const type of ["security_alert", "trial_reminder", "milestone"]) {
      expect(hasNoActor(type), type).toBe(true);
    }
    expect(hasNoActor("hype_post")).toBe(false);
    // And the screen uses it rather than restating the list.
    expect(body(SCREEN)).toMatch(/hasNoActor\(g\.type\)/);
  });
});

/* ------------------------------------------------------------------ *
 * The loader                                                         *
 * ------------------------------------------------------------------ */

type Call = { table: string; columns?: string; filters: string[]; updated?: unknown };

function stub(answers: Record<string, { data?: unknown; error?: unknown; count?: number }>) {
  const calls: Call[] = [];
  const rpcs: string[] = [];
  const make = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = (columns: string) => {
      call.columns = columns;
      return chain();
    };
    builder.eq = (c: string, v: unknown) => {
      call.filters.push(`eq:${c}=${String(v)}`);
      return chain();
    };
    builder.in = (c: string, v: string[]) => {
      call.filters.push(`in:${c}=${v.join(",")}`);
      return chain();
    };
    builder.order = (c: string, o: { ascending: boolean }) => {
      call.filters.push(`order:${c}:${o.ascending ? "asc" : "desc"}`);
      return chain();
    };
    builder.limit = (k: number) => {
      call.filters.push(`limit:${k}`);
      return chain();
    };
    builder.update = (values: unknown) => {
      call.updated = values;
      return chain();
    };
    builder.then = (resolve: (a: unknown) => unknown) =>
      Promise.resolve(answers[table] ?? { data: [], error: null, count: 0 }).then(resolve);
    return builder;
  };
  return {
    calls,
    rpcs,
    client: {
      from: (table: string) => make(table) as never,
      rpc: (fn: string) => {
        rpcs.push(fn);
        return Promise.resolve(answers[fn] ?? { data: null, error: null });
      },
    },
  };
}

describe("the loader asks the right questions", () => {
  it("the newest fifty for this person, newest first", async () => {
    const s = stub({ notifications: { data: [], error: null } });
    await loadNotifs(s.client as never, "me");
    const q = s.calls.find((c) => c.table === "notifications");
    expect(q?.columns).toBe(NOTIF_COLUMNS);
    expect(q?.filters).toContain("eq:user_id=me");
    expect(q?.filters).toContain("order:created_at:desc");
    expect(q?.filters).toContain(`limit:${PAGE}`);
    // The web's own first page. A smaller window here would claim a
    // shorter history than the website shows for the same account.
    expect(PAGE).toBe(50);
    expect(read(WEB_PAGE)).toMatch(/const PAGE = 50;/);
  });

  it("and asks for everything a row actually draws", () => {
    /*
     * **The other direction, and the two are different tests.** The schema
     * check above cannot see a column being DROPPED — everything left is
     * still real, so it stays green while the row renders nothing where
     * that field went. It was the lesson of #84 and it had to be learnt
     * twice: there it was search's select, here it was `body`, which is
     * the words on every single row.
     */
    for (const column of [
      "id", // the key
      "type", // decides the icon, the grouping and the destination
      "target_type",
      "target_id",
      "actor_id", // counts distinct people, and mutes them
      "body", // the words on the row
      "is_read", // the accent edge and the dot
      "created_at", // the time, the section and the group window
    ]) {
      expect(plainColumns(NOTIF_COLUMNS), `activity does not ask for ${column}`).toContain(
        column,
      );
    }
    // And the actor's four, inside the embed.
    for (const field of ["display_name", "username", "avatar_hue", "avatar_url"]) {
      expect(NOTIF_COLUMNS, `activity does not ask the actor for ${field}`).toContain(field);
    }
  });

  it("an embedded actor arrives as an object or as an array; both are read", async () => {
    const asArray = stub({
      notifications: {
        data: [{ ...n(), actor: [{ display_name: "Aman", username: "aman", avatar_hue: 1, avatar_url: null }] }],
        error: null,
      },
      posts: { data: [], error: null },
    });
    const [row] = await loadNotifs(asArray.client as never, "me");
    expect(row.actor?.username).toBe("aman");
  });

  it("a refused query throws with Postgres's own words, not an empty list", async () => {
    const s = stub({ notifications: { data: null, error: { message: 'column "nope" does not exist' } } });
    await expect(loadNotifs(s.client as never, "me")).rejects.toThrow(/does not exist/);
    // The lesson of #83: a destructured-away error and an empty table are
    // indistinguishable, and that shipped a blank feed.
    expect(read(LOAD)).not.toMatch(/const \{ data \} = await/);
  });

  it("thumbnails are four queries, and only for what is on the page", async () => {
    const s = stub({
      notifications: { data: [n({ target_type: "post", target_id: "p1" })], error: null },
      posts: { data: [{ id: "p1", image_url: "a.jpg", image_urls: null }], error: null },
    });
    await loadNotifs(s.client as never, "me");
    const tables = s.calls.map((c) => c.table);
    expect(tables).toContain("posts");
    // A page of post hypes asks nothing of shots, shows or comments.
    expect(tables).not.toContain("shots");
    expect(tables).not.toContain("shows");
    expect(tables).not.toContain("comments");
  });

  it("and a page that needs no still asks for none at all", async () => {
    // The guard on each of the four, not just the three a post page
    // happens not to use: a page of follows should make one query.
    const s = stub({ notifications: { data: [n({ type: "follow", target_type: "profile", target_id: "me" })], error: null } });
    await loadNotifs(s.client as never, "me");
    expect(s.calls.map((c) => c.table)).toEqual(["notifications"]);
  });

  it("and each asks for the picture column its own table has", async () => {
    const s = stub({
      shots: { data: [], error: null },
      shows: { data: [], error: null },
      posts: { data: [], error: null },
      comments: { data: [], error: null },
    });
    await withThumbs(s.client as never, [
      n({ id: "1", target_type: "post", target_id: "p1" }),
      n({ id: "2", target_type: "shot", target_id: "s1" }),
      n({ id: "3", target_type: "show", target_id: "w1" }),
      n({ id: "4", target_type: "comment", target_id: "c1" }),
    ]);
    const columnsFor = (t: string) => s.calls.find((c) => c.table === t)?.columns;
    // posts uses image_url; shots and shows use media_url. Getting these
    // the wrong way round is exactly what #83 shipped.
    expect(columnsFor("posts")).toMatch(/image_url, image_urls/);
    expect(columnsFor("posts")).not.toMatch(/media_url/);
    expect(columnsFor("shots")).toMatch(/media_url, poster_url/);
    expect(columnsFor("shows")).toMatch(/media_url, poster_url/);
    expect(columnsFor("comments")).toMatch(/post_id, shot_id/);
  });

  it("a comment's parent is resolved so the row has somewhere to go", async () => {
    const s = stub({
      comments: { data: [{ id: "c1", post_id: "p9", shot_id: null }], error: null },
    });
    const [row] = await withThumbs(s.client as never, [n({ target_type: "comment", target_id: "c1" })]);
    expect(row.parent).toEqual({ kind: "post", id: "p9" });
    expect(notifTarget(row)).toEqual({ kind: "post-comment", postId: "p9", commentId: "c1" });
  });

  it("and a comment on a Shot is filed as a Shot, not as a post", async () => {
    // post_id and shot_id are both nullable and exactly one is set. Reading
    // whichever is present and calling it a post sends the row to /p/<shot>,
    // which is a post that does not exist.
    const s = stub({ comments: { data: [{ id: "c1", post_id: null, shot_id: "s7" }], error: null } });
    const [row] = await withThumbs(s.client as never, [
      n({ target_type: "comment", target_id: "c1" }),
    ]);
    expect(row.parent).toEqual({ kind: "shot", id: "s7" });
    expect(notifTarget(row)).toEqual({ kind: "shot", id: "s7" });
  });

  it("reading is scoped to what was fetched", async () => {
    const s = stub({ notifications: { error: null } });
    await markRead(s.client as never, ["a", "b"]);
    const q = s.calls.find((c) => c.updated !== undefined);
    expect(q?.updated).toEqual({ is_read: true });
    expect(q?.filters).toContain("in:id=a,b");
    expect(s.rpcs).not.toContain("mark_notifications_read");
  });

  it("and marking nothing asks nothing", async () => {
    const s = stub({});
    await markRead(s.client as never, []);
    expect(s.calls).toHaveLength(0);
  });

  it("the screen marks only the rows it received", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/result\.list\.filter\(\(n\) => !n\.is_read\)\.map\(\(n\) => n\.id\)/);
    expect(src).toMatch(/markRead\(supabase as never, unread\)/);
    // mark_notifications_read() takes no arguments and clears the whole
    // account. On open it silently cleared hundreds nobody had seen.
    expect(src).not.toMatch(/readAll\(\)[\s\S]{0,40}useEffect/);
  });

  it("'Read all' is the deliberate way to clear the rest", async () => {
    const s = stub({ mark_notifications_read: { error: null } });
    await readAll(s.client as never);
    expect(s.rpcs).toEqual(["mark_notifications_read"]);
  });

  it("and a failed Read all puts the rows back", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/const before = notifs;/);
    expect(src).toMatch(/setNotifs\(before\);/);
    expect(src).toMatch(/Couldn't mark everything read\./);
  });

  it("the bell counts without fetching fifty rows", async () => {
    const s = stub({ notifications: { count: 7, error: null } });
    expect(await unreadCount(s.client as never, "me")).toBe(7);
    const q = s.calls.find((c) => c.table === "notifications");
    expect(q?.filters).toContain("eq:user_id=me");
    expect(q?.filters).toContain("eq:is_read=false");
  });
});

describe("the still beside a row is a still", () => {
  it("a clip's poster wins", () => {
    expect(mediaThumb({ media_url: "clip.mp4", poster_url: "cover.jpg" })).toEqual({
      url: "cover.jpg",
    });
  });

  it("a video with no poster draws no square at all", () => {
    // The website's square held a video element whose poster was pinned
    // blank to kill Android's grey play-circle — and a video shows its
    // poster INSTEAD of a frame until it plays, so every Shot row was an
    // empty box. No square is better than a hole.
    expect(mediaThumb({ media_url: "clip.mp4", poster_url: null })).toBeNull();
    expect(mediaThumb({ media_url: "photo.jpg", poster_url: null })).toEqual({ url: "photo.jpg" });
    expect(mediaThumb(null)).toBeNull();
  });

  it("a gallery post shows its first picture", () => {
    expect(postThumb({ image_url: "single.jpg", image_urls: ["first.jpg", "second.jpg"] })).toEqual({
      url: "first.jpg",
    });
    expect(postThumb({ image_url: "single.jpg", image_urls: null })).toEqual({ url: "single.jpg" });
    expect(postThumb({ image_url: null, image_urls: [] })).toBeNull();
  });

  it("and a Show's poster is asked for on BOTH clients", () => {
    /*
     * A defect found by porting. mediaThumb prefers poster_url and the
     * website's own comment says Shows have had posters since 0213 — but
     * its select stopped at media_url, so the poster was never fetched
     * and every video Show rendered an empty square. Fixed in both rather
     * than copied.
     */
    expect(read(WEB_PAGE)).toMatch(/from\("shows"\)\.select\("id, media_url, poster_url"\)/);
    expect(read(LOAD)).toMatch(/SHOW_THUMB_COLUMNS =\s*\n?\s*"id, media_url, poster_url"/);
  });
});

/* ------------------------------------------------------------------ *
 * Push                                                               *
 * ------------------------------------------------------------------ */

describe("push registers the token the server already sends to", () => {
  it("the NATIVE device token, not an Expo push token", () => {
    /*
     * The server signs a service-account JWT and posts to
     * projects/<id>/messages:send with a device token (src/lib/fcm.ts),
     * proven end to end in #66. An Expo push token would need Expo's own
     * delivery service — a second path and a server change — for a
     * feature that already works.
     */
    const src = body(PUSH);
    expect(src).toMatch(/getDevicePushTokenAsync\(\)/);
    expect(src).not.toMatch(/getExpoPushTokenAsync/);
    expect(read(FCM)).toMatch(/messages:send/);
  });

  it("into the same table and the same platform values the old shell wrote", () => {
    const src = body(PUSH);
    expect(src).toMatch(/from\("push_devices"\)\.upsert\(/);
    expect(src).toMatch(/onConflict: "token"/);
    expect(platformName("android")).toBe("android");
    expect(platformName("ios")).toBe("ios");
    expect(platformName("web")).toBeNull();
    // The Capacitor shell's own writer, for the comparison.
    expect(read("src/lib/native-push.ts")).toMatch(/from\("push_devices"\)\.upsert\(/);
  });

  it("a refusal and a device that cannot register are different answers", () => {
    /*
     * Both words appear in this file more than once, so asserting that
     * each EXISTS says nothing about which one a given failure returns —
     * a stored row that failed to write reported "denied", sending
     * somebody to a system setting that was already correct.
     *
     * This file cannot be run here (importing expo-notifications fails at
     * evaluation under Vitess, which is why platformName lives in its own
     * module), so each answer is pinned to the statement that produces it
     * rather than to the file.
     */
    const src = body(PUSH);
    expect(src).toMatch(/if \(status !== "granted"\) return "denied";/);
    expect(src).toMatch(/return error \? "failed" : "registered";/);
    expect(src).toMatch(/canAskAgain \? "ask" : "denied"/);
    // And a token that never arrived is a device that cannot, not a no.
    expect(src).toMatch(/token\.length === 0\) return "failed";/);
  });

  it("and turning it off deletes by user, not by a token that may be stale", () => {
    expect(body(PUSH)).toMatch(/delete\(\)\.eq\("user_id", userId\)/);
  });

  it("the nudge is asked where the website asks it", () => {
    expect(body(SCREEN)).toMatch(/ListHeaderComponent=\{<PushNudge \/>\}/);
    // The website's own contextual pitch, on the same screen.
    expect(read(WEB_PAGE)).toMatch(/<PushNudge \/>/);
  });

  it("with the website's words, and no snooze it cannot keep", () => {
    const src = body(NUDGE);
    expect(src).toMatch(/Never miss these/);
    expect(src).toMatch(/Get hypes and replies even when Hypefy is closed\./);
    expect(read("src/components/pwa/PushNudge.tsx")).toMatch(/Never miss these/);
    // No key-value store is installed, so a Dismiss would come back next
    // launch while looking remembered — the kv.ts failure mode exactly.
    expect(src).not.toMatch(/SNOOZE|localStorage|AsyncStorage/);
  });

  it("and names the setting when the OS will not ask again", () => {
    const src = body(NUDGE);
    expect(src).toMatch(/state === "denied"/);
    expect(src).toMatch(/turned off for Hypefy in your phone's settings/);
    // The button is gone in that state rather than present and inert.
    expect(src).toMatch(/\{state === "ask" && \(/);
  });
});

describe("tapping a push reaches a screen", () => {
  it("both ways in, and the launching tap is the one that matters", () => {
    /*
     * A tap while the app runs comes through the listener. A tap that
     * LAUNCHED the app happened before any listener existed and is only
     * readable from getLastNotificationResponseAsync — which is the common
     * case, because notifications are tapped from a sleeping phone.
     * Handling only the listener gives an app that works in testing and
     * opens the feed in real use.
     */
    const src = body(TAPS);
    expect(src).toMatch(/getLastNotificationResponseAsync\(\)/);
    expect(src).toMatch(/addNotificationResponseReceivedListener\(open\)/);
  });

  it("the launching tap is handled once, not on every remount", () => {
    const src = body(TAPS);
    expect(src).toMatch(/launchHandled\.current/);
    expect(src).toMatch(/launchHandled\.current = true;/);
  });

  it("and waits for a navigator, because pushing before one is dropped", () => {
    const src = body(TAPS);
    expect(src).toMatch(/useRootNavigationState\(\)/);
    expect(src).toMatch(/if \(!navState\?\.key\) return;/);
  });

  it("the destination comes from data.url, parsed back into a place", () => {
    const src = body(TAPS);
    expect(src).toMatch(/\.url/);
    expect(src).toMatch(/mobileRoute\(parseWebHref\(url\)\)/);
    // The sender's half.
    expect(read(FCM)).toMatch(/notification\.url \? \{ url: notification\.url \}/);
  });

  it("and a place this app lacks opens Activity rather than nothing", () => {
    expect(body(TAPS)).toMatch(/route \?\? \{ pathname: "\/notifications" \}/);
    expect(pushTarget({ type: "milestone", target_type: null, target_id: null })).toEqual({
      kind: "activity",
    });
  });

  it("the listener is removed", () => {
    expect(body(TAPS)).toMatch(/return \(\) => sub\.remove\(\);/);
  });

  it("the tap handler is actually mounted", () => {
    // A hook nobody calls is the same as no hook, and this is the
    // assertion every other one here is worthless without.
    expect(body(ROOT)).toMatch(/usePushTaps\(\);/);
  });
});

describe("the sender and the app agree on the Android channel", () => {
  it("one constant, imported by both", () => {
    /*
     * The app creates the channel; the sender chooses the id. Disagreeing
     * errors nothing: Firebase posts to a fallback channel it makes called
     * "Miscellaneous", at an importance nobody chose — so a message can
     * arrive with no sound and no banner and nothing to point at.
     */
    expect(read(FCM)).toMatch(/channel_id: PUSH_CHANNEL_ID/);
    expect(read(FCM)).toMatch(/from "@hypefy\/core\/push-channel"/);
    expect(body(TAPS)).toMatch(/setNotificationChannelAsync\(PUSH_CHANNEL_ID, \{/);
    expect(PUSH_CHANNEL_ID).toBe("default");
    // Neither side writes the id out.
    expect(read(FCM)).not.toMatch(/channel_id: "default"/);
    expect(read(TAPS)).not.toMatch(/setNotificationChannelAsync\("default"/);
  });

  it("at the importance a message needs to be seen", () => {
    expect(body(TAPS)).toMatch(/AndroidImportance\.HIGH/);
  });
});

/* ------------------------------------------------------------------ *
 * One rule for where a notification goes, including push             *
 * ------------------------------------------------------------------ */

describe("the push route stopped being a third copy of the destination rule", () => {
  /*
   * It had drifted in five ways, each one a push that opened the wrong
   * screen — and none of it was visible from that file, which reads as a
   * reasonable list. It only shows up beside the other copy.
   */
  it("it calls the shared rule", () => {
    const src = read(WEB_PUSH_ROUTE);
    expect(src).toMatch(/webHref\(pushTarget\(\{ \.\.\.n, actor: \{ username: actorUsername \} \}\)\)/);
    expect(src).not.toMatch(/if \(n\.type === "security_alert"\) return "\/settings\/security";/);
  });

  it("so a DM push opens the DM, which it did not", () => {
    const t = pushTarget({ type: "new_message", target_type: "conversation", target_id: "v1" });
    expect(webHref(t)).toBe("/messages/v1");
  });

  it("and a question-sticker answer opens the answers, which it did not", () => {
    const t = pushTarget({ type: "show_answer", target_type: "show", target_id: "w1" });
    expect(webHref(t)).toBe("/shows/w1/answers");
  });

  it("and all four person notifications open the person, not Activity", () => {
    for (const type of ["follow", "follow_accepted", "follow_request", "referral_joined"]) {
      const t = pushTarget({
        type,
        target_type: "profile",
        target_id: "me",
        actor: { username: "aman" },
      });
      expect(webHref(t), type).toBe("/u/aman");
    }
  });

  it("while Activity stays the fallback, which was the one part that was right", () => {
    for (const type of ["milestone", "back_after"]) {
      expect(webHref(pushTarget({ type, target_type: null, target_id: null })), type).toBe(
        "/notifications",
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * Reach — the standing rule since #78                                *
 * ------------------------------------------------------------------ */

describe("Activity can be reached, and left", () => {
  it("the bell is in the top bar, where the website puts it", () => {
    const bar = body(TOPBAR);
    expect(bar).toMatch(/<NotificationBell \/>/);
    expect(body(BELL)).toMatch(/router\.push\("\/notifications"\)/);
    // The website's right flank holds exactly this control.
    expect(read("src/components/layout/TopBar.tsx")).toMatch(/<NotificationBell/);
  });

  it("and the bar is mounted, so the bell is on screen", () => {
    const layout = body("apps/mobile/app/(tabs)/_layout.tsx");
    expect(layout).toMatch(/<TopBar \/>/);
  });

  it("the mark is the Hype star, as the website draws it", () => {
    // The website's NotificationBell renders HypeIcon, not a bell.
    expect(body(BELL)).toMatch(/<HypeIcon size=\{22\}/);
    expect(read("src/components/layout/NotificationBell.tsx")).toMatch(/<HypeIcon/);
  });

  it("the badge says the count to a screen reader, not just in colour", () => {
    expect(body(BELL)).toMatch(/\$\{unread\} unread/);
  });

  /*
   * **This was a focus re-read, and it was wrong twice over.** The bell is
   * rendered as the navigator's HEADER rather than as a screen, so
   * `useFocusEffect`'s navigation context is not something to rely on
   * there — and calling the counter straight from an effect body is the
   * cascading-render shape react-hooks forbids, which is how the first
   * mistake surfaced. Realtime is what the website uses for this badge
   * anyway, so the two clients now keep it current the same way.
   */
  it("stays current by realtime, filtered to this account", () => {
    const src = body(BELL);
    expect(src).toMatch(/channel\(`notif-badge:\$\{data\.user\.id\}`\)/);
    // Without the filter every notification this account may read arrives
    // on the device to be counted and discarded there.
    expect(src.match(/filter: `user_id=eq\.\$\{data\.user\.id\}`/g)).toHaveLength(2);
    expect(src).not.toMatch(/useFocusEffect/);
  });

  it("an arrival adds one; a read re-counts, because many can be read at once", () => {
    const src = body(BELL);
    // The table, as well as the events. Watching the wrong one leaves a
    // badge that never moves, and the two subscriptions look identical.
    expect(src.match(/table: "notifications"/g)).toHaveLength(2);
    expect(src).toMatch(/event: "INSERT"/);
    expect(src).toMatch(/setUnread\(\(n\) => n \+ 1\)/);
    expect(src).toMatch(/event: "UPDATE"/);
    // Arithmetic cannot answer this one: Activity marks a whole page read.
    expect(src).toMatch(/readCount\(\)\.then\(apply\)/);
  });

  it("and the channel is removed even though it is assigned after an await", () => {
    /*
     * The leak the website records: leaving before getUser() resolved ran
     * the cleanup while the channel was still null, and the subscribe
     * happened afterwards with nothing left to tear it down.
     */
    const src = body(BELL);
    expect(src).toMatch(/let channel: ReturnType<typeof supabase\.channel> \| null = null;/);
    expect(src).toMatch(/if \(channel\) void supabase\.removeChannel\(channel\);/);
    expect(src).toMatch(/cancelled = true;/);
  });

  it("reading and applying are separate, as an effect requires", () => {
    // #79's rule: an event handler may set state, an effect body may not.
    const src = body(BELL);
    expect(src).toMatch(/const readCount = async \(\)/);
    expect(src).toMatch(/const apply = \(next: number \| null\)/);
    expect(src).toMatch(/if \(cancelled \|\| next === null\) return;/);
    // And `apply` is the one both paths go through, not merely declared.
    expect(src).toMatch(/apply\(first\);/);
    expect(src).toMatch(/readCount\(\)\.then\(apply\)/);
    /*
     * **It also has to DO something**, which asserting its declaration did
     * not cover: a version whose body returned early with the setState
     * moved into a second, dead function compiled, linted and kept every
     * assertion above green, while the badge only ever changed by the
     * INSERT handler's arithmetic and never from a read. So the body is
     * sliced and the one statement that matters is named in it.
     */
    const apply = src.slice(src.indexOf("const apply = ("));
    expect(apply.slice(0, apply.indexOf("};"))).toMatch(/setUnread\(next\);/);
  });

  it("a count that could not be read leaves the last one standing", () => {
    /*
     * `null`, not `0`. Both render no badge on a first load, which is why
     * this looked equivalent — but a failed read AFTER the badge said five
     * would wipe it to nothing, reporting "no notifications" because the
     * network blinked. Refusing to answer is not an answer of zero.
     */
    const src = body(BELL);
    expect(src).toMatch(/\} catch \{[\s\S]*?return null;/);
    expect(src).not.toMatch(/\} catch \{[\s\S]*?return 0;/);
  });

  it("the screen has a way back out", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/accessibilityLabel="Back"/);
    expect(src).toMatch(/router\.back\(\)/);
  });

  it("and a session that has gone hands back rather than showing an empty list", () => {
    // An empty Activity and a signed-out one look identical, and only one
    // of them is the person's own account being empty.
    expect(body(SCREEN)).toMatch(/kind: "signed-out"/);
    expect(body(SCREEN)).toMatch(/router\.replace\("\/"\)/);
  });
});

/* ------------------------------------------------------------------ *
 * The build this needs                                               *
 * ------------------------------------------------------------------ */

describe("a third native module means a new build, and a version that says so", () => {
  it("expo-notifications is a plugin and a dependency", () => {
    const app = JSON.parse(read("apps/mobile/app.json")) as {
      expo: { plugins: unknown[]; version: string; runtimeVersion: { policy: string } };
    };
    expect(app.expo.plugins).toContain("expo-notifications");
    const pkg = JSON.parse(read("apps/mobile/package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["expo-notifications"]).toBeTruthy();
  });

  it("and the version moved, so the 1.1.0 build is never served this JS", () => {
    /*
     * runtimeVersion follows `version`. Without the bump, an update
     * carrying code that imports expo-notifications would be handed to a
     * binary with no such native module — which crashes on launch, over
     * the air, with no way back.
     */
    const app = JSON.parse(read("apps/mobile/app.json")) as {
      expo: { version: string; runtimeVersion: { policy: string } };
    };
    expect(app.expo.runtimeVersion.policy).toBe("appVersion");
    expect(app.expo.version).toBe("1.2.0");
  });
});
