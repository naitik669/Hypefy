import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  assemble,
  normalisePost,
  POST_COLUMNS,
  FOLLOW_CAP,
  FOLLOWED_LIMIT,
  GLOBAL_LIMIT,
  type FeedPost,
} from "../apps/mobile/src/feed/load";
import { rankBatch } from "../packages/core/src/feed-rank";
import { optimistic, settle, doubleTap } from "../packages/core/src/hype";
import { kvInstalled } from "../packages/core/src/kv";
import { entryFor, routeFor } from "../apps/mobile/src/auth/entry";

/**
 * The phone's home feed.
 *
 * The first screen in the app that shows real data, so the questions are
 * different from the onboarding slides': does it rank the way the website
 * ranks, does it leave out what the website leaves out, and can a person
 * reach it and get back.
 *
 * The ranking is NOT re-tested here — `rankBatch` has its own tests and is
 * the same function on both clients. What is tested is that this feed
 * calls it rather than sorting for itself, and that the filtering in front
 * of it is right.
 */

const WEB = "src/app/(app)/home/page.tsx";
const LOAD = "apps/mobile/src/feed/load.ts";
const CARD = "apps/mobile/src/feed/FeedCard.tsx";
const SCREEN = "apps/mobile/app/(tabs)/home.tsx";
const WEB_CARD = "src/components/feed/FeedCard.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Source with comments and imports gone — both have stood in for code here. */
function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

/** Source with comments gone but imports kept. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function post(over: Partial<FeedPost> & { id: string; user_id: string }): FeedPost {
  return {
    caption: "hello",
    media_url: "https://example.test/a.jpg",
    media_urls: null,
    created_at: "2026-11-18T12:00:00.000Z",
    hype_count: 0,
    comment_count: 0,
    save_count: 0,
    share_count: 0,
    hashtags: null,
    profiles: null,
    ...over,
  };
}

const CTX = {
  currentUserId: "me",
  following: new Set<string>(),
  blocked: new Set<string>(),
  hiddenPosts: new Set<string>(),
  seen: new Set<string>(),
  now: Date.parse("2026-11-18T13:00:00.000Z"),
};

describe("the feed ranks with the website's own ranking", () => {
  it("defers to rankBatch rather than sorting for itself", () => {
    /*
     * The blueprint's claim is that a feed on a second client is a query
     * and a render, not a second ranking. This is the assertion that keeps
     * it true: a local sort appearing here is the drift the shared core
     * exists to prevent, and it would be invisible — both feeds would look
     * plausible and show different things.
     */
    const src = body(LOAD);
    expect(src).toMatch(/rankBatch\(/);
    expect(src, "the feed is sorting for itself").not.toMatch(/\.sort\(/);
    expect(src, "the feed is scoring for itself").not.toMatch(/feedScore\(/);
  });

  it("and produces exactly what rankBatch produces, for the same input", () => {
    // Called, not read: this is the difference between importing the
    // function and actually using its answer.
    const rows = [
      post({ id: "a", user_id: "stranger", created_at: "2026-11-18T12:00:00.000Z" }),
      post({ id: "b", user_id: "friend", created_at: "2026-11-18T11:00:00.000Z" }),
      post({ id: "c", user_id: "me", created_at: "2026-11-18T10:00:00.000Z" }),
    ];
    const ctx = { ...CTX, following: new Set(["friend"]) };
    expect(assemble(rows, ctx).map((p) => p.id)).toEqual(
      rankBatch(rows, {
        currentUserId: ctx.currentUserId,
        following: ctx.following,
        seen: ctx.seen,
        now: ctx.now,
      }).map((p) => p.id),
    );
  });

  it("a followed author outranks a stranger posted at the same moment", () => {
    // The one ranking fact worth asserting here, because it is what the
    // feed is FOR, and it would survive a broken call to rankBatch that
    // returned its input untouched.
    const at = "2026-11-18T12:00:00.000Z";
    const rows = [
      post({ id: "stranger", user_id: "s", created_at: at }),
      post({ id: "friend", user_id: "f", created_at: at }),
    ];
    const order = assemble(rows, { ...CTX, following: new Set(["f"]) }).map((p) => p.id);
    expect(order[0]).toBe("friend");
  });
});

describe("the feed leaves out what the website leaves out", () => {
  it("drops a post twice over, from the two overlapping windows", () => {
    /*
     * The followed window and the global window overlap by design — a
     * followed author's post is in both — so the same row arrives twice.
     * Rendered twice it is a duplicate card and a React key warning.
     */
    const rows = [
      post({ id: "same", user_id: "f" }),
      post({ id: "same", user_id: "f" }),
      post({ id: "other", user_id: "s" }),
    ];
    expect(assemble(rows, CTX).map((p) => p.id).sort()).toEqual(["other", "same"]);
  });

  it("drops a blocked author's posts", () => {
    const rows = [post({ id: "a", user_id: "blocked" }), post({ id: "b", user_id: "ok" })];
    const out = assemble(rows, { ...CTX, blocked: new Set(["blocked"]) });
    expect(out.map((p) => p.id)).toEqual(["b"]);
  });

  it("drops a muted author's posts too, because this screen treats them alike", () => {
    /*
     * The web's own note: "On this page a muted person is left out exactly
     * as a blocked one is", which is why it adds the muted ids to the
     * blocked set rather than filtering twice. The phone does the same, so
     * this asserts the join actually happens in the loader.
     */
    expect(body(LOAD)).toMatch(/for \(const id of quiet\.muted\) blocked\.add\(id\)/);
    const rows = [post({ id: "a", user_id: "muted" })];
    expect(assemble(rows, { ...CTX, blocked: new Set(["muted"]) })).toEqual([]);
  });

  it("drops a single hidden post without hiding its author", () => {
    // "Not interested" hides one post. The author's others stay.
    const rows = [post({ id: "hidden", user_id: "a" }), post({ id: "kept", user_id: "a" })];
    const out = assemble(rows, { ...CTX, hiddenPosts: new Set(["hidden"]) });
    expect(out.map((p) => p.id)).toEqual(["kept"]);
  });

  it("and uses core's isQuieted rather than open-coding either check", () => {
    const src = body(LOAD);
    expect(src).toMatch(/isQuieted\(post, "post"/);
    expect(src, "the hidden-post check is open-coded beside isQuieted").not.toMatch(
      /hiddenPosts\.has\(/,
    );
  });
});

describe("the queries are the website's queries", () => {
  it("two windows, at the website's two limits", () => {
    /*
     * The web asks followed authors separately so their posts are
     * guaranteed a slot even when the firehose has scrolled past them.
     * The limits are read off the web's page so a change there shows up
     * here rather than leaving the phone with a narrower candidate set.
     */
    const web = code(WEB);
    const limits = [...web.matchAll(/\.limit\((\d+)\)/g)].map((m) => Number(m[1]));
    expect(limits, "the web no longer asks for 40 followed posts").toContain(FOLLOWED_LIMIT);
    expect(limits, "the web no longer asks for 150 global posts").toContain(GLOBAL_LIMIT);
    expect(FOLLOWED_LIMIT).toBe(40);
    expect(GLOBAL_LIMIT).toBe(150);
  });

  it("the follow cap is the website's, and for the website's reason", () => {
    /*
     * Not a volume limit. Every id is spread into `.in("user_id", …)`,
     * which PostgREST renders as a comma-separated value in a GET URL —
     * past a few thousand follows that URL exceeds proxy limits and the
     * feed returns 414, breaking it for the people who use the app most.
     * The limit is the transport's, so it is the same number here.
     */
    expect(code(WEB)).toMatch(/\.limit\(2000\)/);
    expect(FOLLOW_CAP).toBe(2000);
    /*
     * Both halves of the reason: the mechanism (a proxy refusing a long
     * GET URL) and the symptom (414). An `/414|proxy/` alternation was the
     * first version, and mutation F13 removed the status code while
     * "proxy" kept it green — which is the scope error again, in a test
     * about a comment.
     */
    const src = read(LOAD);
    expect(src, "the symptom of the cap being too high is no longer recorded").toMatch(/\b414\b/);
    expect(src, "the mechanism behind the cap is no longer recorded").toMatch(/proxy/);
  });

  it("asks for the columns the card actually renders, and no more", () => {
    /*
     * The web selects `*` plus the profile join. This asks for a named
     * list instead, which is not a parity break but a deliberate
     * difference: on a phone every column crosses a mobile connection.
     * The assertion is that nothing the card reads has been left out.
     */
    const reads = [
      "id",
      "user_id",
      "caption",
      "media_url",
      "media_urls",
      "created_at",
      "hype_count",
      "comment_count",
      "save_count",
      "share_count",
    ];
    for (const column of reads) {
      expect(POST_COLUMNS, `${column} is not asked for`).toMatch(
        new RegExp(`(^|[ ,])${column}[,\\s]`),
      );
    }
    // The author's row, under the same constraint name the web uses — a
    // posts table with two foreign keys to profiles needs it named.
    expect(POST_COLUMNS).toContain("profiles!posts_user_id_fkey");
    expect(code(WEB)).toContain("profiles!posts_user_id_fkey");
  });

  it("and an embedded profile is read whether it arrives as a row or a list", () => {
    /*
     * PostgREST returns an embedded one-to-one as an object, and the same
     * join as a one-element array in other shapes. The web has a
     * `normalise` for exactly this. Getting it wrong shows up as every
     * card saying "Someone".
     */
    const asObject = normalisePost({ id: "a", profiles: { id: "p", display_name: "Maya" } });
    const asArray = normalisePost({ id: "a", profiles: [{ id: "p", display_name: "Maya" }] });
    expect(asObject.profiles?.display_name).toBe("Maya");
    expect(asArray.profiles?.display_name).toBe("Maya");
    expect(normalisePost({ id: "a", profiles: [] }).profiles).toBeNull();
    expect(normalisePost({ id: "a" }).profiles).toBeNull();
    /*
     * The web's normalise is asserted by what it DOES, not by the presence
     * of the test it does it with: `false && Array.isArray(p.profiles)`
     * still matched a check for the condition, so mutation F42 disabled
     * the web's normalisation and passed. This matches the whole ternary.
     */
    expect(code(WEB), "the web no longer normalises its embedded profile").toMatch(
      /Array\.isArray\(p\.profiles\)\s*\?\s*p\.profiles\[0\]/,
    );
  });
});

describe("the card's measurements are the website's", () => {
  const SCALE: ReadonlyArray<readonly [string, RegExp, string]> = [
    ["gap-3 px-4 py-3", /gap: 12,\s*paddingHorizontal: 16,\s*paddingVertical: 12/, "the header"],
    ["size={40}", /AVATAR = 40/, "the avatar"],
    ["mx-4", /marginHorizontal: 16/, "the media's inset"],
    ["rounded-2xl", /borderRadius: 16/, "the media's radius"],
    ["gap-5", /gap: 20/, "between action groups"],
    ["gap-1.5", /gap: 6/, "inside one action"],
    ["pb-3", /paddingBottom: 12/, "under the card"],
  ];

  for (const [cls, re, what] of SCALE) {
    it(`${what} — ${cls}`, () => {
      expect(code(WEB_CARD), `the web's card no longer uses ${cls}`).toContain(cls);
      expect(code(CARD), `${what} does not match`).toMatch(re);
    });
  }

  it("the three action icons are the web's three uneven sizes", () => {
    /*
     * 23, 22 and 21 — deliberately uneven on the web, because the glyphs
     * have different optical weights. One shared number would be wrong,
     * and each is checked against the web's own JSX.
     */
    const web = code(WEB_CARD);
    for (const [icon, size] of [
      ["HypeIcon", 23],
      ["CommentIcon", 22],
      ["ShareIcon", 21],
    ] as const) {
      expect(web, `the web no longer draws ${icon} at ${size}`).toMatch(
        new RegExp(`<${icon}[\\s\\S]{0,80}?size=\\{${size}\\}`),
      );
      expect(code(CARD), `${icon} is not ${size} on the phone`).toMatch(
        new RegExp(`const ${icon === "HypeIcon" ? "HYPE" : icon === "CommentIcon" ? "COMMENT" : "SHARE"} = ${size}`),
      );
    }
    // And the comment glyph's heavier stroke, which the web sets explicitly.
    expect(web).toMatch(/<CommentIcon size=\{22\} strokeWidth=\{2\.2\}/);
    expect(code(CARD)).toMatch(/strokeWidth=\{2\.2\}/);
  });

  it("counts and times are formatted by the shared functions, not local ones", () => {
    /*
     * "1.2k" and "5m" are the kind of thing two clients round differently
     * without anyone noticing until a screenshot shows 1.2k beside 1.3k
     * for the same post.
     */
    const src = code(CARD);
    expect(src).toMatch(/from "@hypefy\/core\/format"/);
    expect(src).toMatch(/from "@hypefy\/core\/time"/);
    /*
     * Every count goes THROUGH formatCount, which is the assertion that
     * matters. The first version only said the file did not contain
     * `toFixed(` — so a hand-rolled divide-by-a-thousand that happened not
     * to use toFixed slipped past it. Mutation F25 found that.
     */
    // The two counts still read straight off the post.
    for (const field of ["comment_count", "share_count"]) {
      expect(src, `${field} is not formatted by the shared function`).toContain(
        `formatCount(post.${field} ?? 0)`,
      );
    }
    // The hype count comes from the hook now, because the card writes it —
    // but it is still formatted by the same shared function.
    expect(src, "the hype count is not formatted by the shared function").toContain(
      "formatCount(hype.state.count)",
    );
    expect(src).toContain("timeAgoShort(post.created_at)");
    // And nothing is doing the arithmetic beside it.
    expect(src, "the card is formatting counts itself").not.toMatch(/\/ 1000|toFixed\(/);
  });

  it("the name is plain, as the web's card deliberately keeps it", () => {
    /*
     * The web's own reason, worth keeping: a name font and a glow are for
     * the places a person is the subject, and six different faces down one
     * scroll reads as six different apps. The cosmetics are not lost, they
     * are not worn here.
     */
    expect(code(WEB_CARD)).toContain("name_font");
    expect(code(CARD), "the feed card started wearing name cosmetics").not.toMatch(
      /name_font|name_glow/,
    );
  });
});

describe("what the card does not do yet, and does not pretend to", () => {
  it("hype and comments are the ONLY actions with a press handler", () => {
    /*
     * Share and save are still writes with nothing behind them. A button
     * that looks live and does nothing is worse than a plain count, so
     * they stay as counts.
     *
     * The count in this assertion has now moved twice — "none", then
     * "one", now "two" — and each move was a real change in what the
     * screen can do. That is the point: a test describing an absence has
     * to be re-read when the screen gains a capability, not just re-run,
     * or it goes on passing while saying something false.
     */
    const src = body(CARD);
    const actions = src.slice(src.indexOf("styles.actions"), src.indexOf("Caption"));
    expect(
      [...actions.matchAll(/onPress/g)].length,
      "an action gained a handler without being announced",
    ).toBe(2);
    expect(actions, "hyping is no longer wired").toMatch(/onPress=\{hype\.toggle\}/);
    expect(actions, "comments are no longer reachable").toMatch(/router\.push\(/);
    expect(
      [...actions.matchAll(/<Pressable/g)].length,
      "an action became pressable without being announced",
    ).toBe(2);
    // Share and save, still inert.
    expect(actions).toMatch(/<View style=\{styles\.action\}>\s*<ShareIcon/);
    expect(actions).toMatch(/<View style=\{styles\.action\}>\s*<Bookmark/);
  });

  it("and the counts shown are the post's own, not invented", () => {
    const src = body(CARD);
    for (const field of ["comment_count", "share_count"]) {
      expect(src, `${field} is not read`).toContain(field);
    }
    // The hype count starts from the post and is then the hook's.
    expect(src).toContain("count: post.hype_count ?? 0");
  });

  it("the web's celebration is absent, and recorded as absent", () => {
    /*
     * The particle burst, the break animation when a hype is taken back,
     * and the haptic tap are the reason hyping feels like something on the
     * site. Approximating them badly would be worse than their absence, so
     * they are a separate piece of work — and this fails if a stand-in
     * appears without one.
     */
    expect(code(WEB_CARD)).toMatch(/HypeParticles|animate-hype-pop/);
    const src = body(CARD);
    expect(src, "something is standing in for the particle burst").not.toMatch(
      /particle|burst|confetti/i,
    );
    expect(read(CARD), "the missing celebration is no longer explained").toMatch(
      /particle burst/,
    );
  });

  it("a row with neither media nor caption is skipped, not rendered empty", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/\.filter\(isRenderable\)/);
  });
});

describe("the screen can be reached, and left", () => {
  /*
   * The standing rule after #78: the suite can prove a screen MATCHES the
   * website without proving anyone can REACH it. Reach is a property of
   * the app, not of a component, so every screen gets an assertion about
   * how a person arrives and how they get out.
   */
  it("home is a destination in the bar", () => {
    expect(existsSync(SCREEN)).toBe(true);
    const nav = read("packages/core/src/navigation.ts");
    expect(nav).toMatch(/href: "\/home"/);
  });

  it("the entry router sends a signed-in person here", () => {
    // Called rather than read — entry.ts exists precisely so this can be.
    expect(entryFor({ session: { user: {} }, error: null })).toEqual({ kind: "home" });
    expect(routeFor({ kind: "home" })).toBe("/home");
  });

  it("and a session that has gone hands back to the entry router", () => {
    /*
     * The feed is behind auth. If the session is gone by the time this
     * screen asks, it must not render an empty feed as though the account
     * simply had nothing — it hands the decision back to the one place
     * that owns it.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/router\.replace\("\/"\)/);
    expect(src).toMatch(/authError \|\| !data\.user/);
  });

  it("there is still a way to sign out from the bar", () => {
    // The #78 defect, asserted from this test file too: a new screen
    // behind auth must not become another dead end.
    const profile = body("apps/mobile/app/(tabs)/profile.tsx");
    expect(profile).toMatch(/<SignOutRow\s*\/?>/);
  });
});

describe("the three states are all said out loud", () => {
  it("loading, failed with the reason, and empty", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/ActivityIndicator/);
    expect(src).toMatch(/Could not load your feed/);
    expect(src).toMatch(/\{error\}/);
    expect(src).toMatch(/ListEmptyComponent/);
    expect(src).toMatch(/Nothing here yet/);
  });

  it("the empty state is not a blank screen, because it is a state real users hit", () => {
    /*
     * 23 accounts and 30 posts in the whole database. "Nothing yet" is day
     * one for a new user, and a blank screen reads as a broken feed —
     * which the launch notes name as the thing most likely to make launch
     * fail.
     */
    const src = body(SCREEN);
    const empty = src.slice(src.indexOf("ListEmptyComponent"));
    expect(empty).toMatch(/Follow a few people/);
    expect(empty).toMatch(/Pull down/);
  });

  it("and a failure offers a retry rather than only an apology", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/accessibilityLabel="Try again"/);
    expect(src).toMatch(/onPress=\{\(\) => void reload\(\)\}/);
  });
});

describe("the list is built for a phone", () => {
  it("a FlatList, not a mapped ScrollView", () => {
    /*
     * The candidate window is up to 190 posts and every card holds a
     * full-width image. This is the one performance decision on the screen
     * that cannot be retrofitted cheaply, and the rules file is explicit
     * about it.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/<FlatList/);
    expect(src, "the feed is a mapped ScrollView").not.toMatch(/ScrollView/);
    expect(src).toMatch(/keyExtractor=\{\(p\) => p\.id\}/);
  });

  it("and leaves the tab bar's room by the shared arithmetic", () => {
    /*
     * navSpace(bottom inset) — the same figure the web's scroll containers
     * leave and the same one Placeholder uses, so content clearing the bar
     * is arithmetic both clients share rather than a number typed twice.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/navSpace\(insets\.bottom\)/);
    expect(src, "the bar's room is hard-coded").not.toMatch(/paddingBottom: \d/);
  });
});

describe("the already-seen demotion is absent, and absent honestly", () => {
  it("no in-memory store is installed as a default", () => {
    /*
     * A synchronous Kv on a phone wants MMKV, a native module — a cloud
     * build and the end of over-the-air delivery. So nothing is installed,
     * `loadSeen` returns an empty set, and the demotion does nothing.
     *
     * The temptation is `installKv(memoryKv())`, and kv.ts's own note
     * explains why that is the worse failure: it appears to work for a
     * session and then everything is gone. `absentKv` never appears to
     * work at all.
     */
    /*
     * Asserted over the app's source, not with `kvInstalled()`: the test
     * harness installs a web-storage Kv for every suite (tests/setup.ts),
     * so that function answers a question about the test environment and
     * not about the phone. Reading it was the first version of this and it
     * failed immediately — correctly, and for a reason that had nothing to
     * do with the app.
     */
    const app = [
      "apps/mobile/app/_layout.tsx",
      "apps/mobile/src/supabase.ts",
      "apps/mobile/src/session-store.ts",
      LOAD,
      SCREEN,
    ];
    const installs = app.filter((p) => existsSync(p) && /installKv\(/.test(code(p)));
    expect(installs, "the app installs a Kv — if it is a real one, update this test").toEqual([]);
    // And the function exists to be asserted on, so it is referenced.
    expect(typeof kvInstalled).toBe("function");
  });

  it("but the feed still asks, so it works the day a real store lands", () => {
    expect(body(LOAD)).toMatch(/seen: loadSeen\(\)/);
  });

  it("and the omission is recorded where someone reading the loader will see it", () => {
    const src = read(LOAD);
    expect(src).toMatch(/MMKV/);
    expect(src).toMatch(/Ads, Ghost Share/);
    expect(src).toMatch(/Rehypes/);
    expect(src).toMatch(/Affinity and interests/);
  });
});

describe("hyping is one rule for both clients", () => {
  /*
   * The first WRITE either client makes to the same row, which is why the
   * three rules are in @hypefy/core/hype and called by both rather than
   * written twice. Each one is a failure nobody would notice: a negative
   * count, a client keeping its own guess after the server answered, or a
   * rollback to "the opposite of now" instead of to what was there.
   */

  it("the optimistic step never shows a negative count", () => {
    /*
     * hype_count is denormalised and the feed read it seconds ago, so
     * un-hyping from a stale 0 is not hypothetical. The server cannot
     * produce -1, so a -1 on screen is always the client's own arithmetic.
     */
    expect(optimistic({ hyped: true, count: 0 })).toEqual({ hyped: false, count: 0 });
    expect(optimistic({ hyped: true, count: 1 })).toEqual({ hyped: false, count: 0 });
    expect(optimistic({ hyped: false, count: 0 })).toEqual({ hyped: true, count: 1 });
    expect(optimistic({ hyped: false, count: 41 })).toEqual({ hyped: true, count: 42 });
  });

  it("the server's answer wins over the guess", () => {
    // Two people hyping at once is the ordinary case, so the count that
    // comes back is rarely the one the client predicted.
    const guess = optimistic({ hyped: false, count: 5 });
    expect(guess).toEqual({ hyped: true, count: 6 });
    expect(settle(guess, { hyped: true, hype_count: 9 })).toEqual({ hyped: true, count: 9 });
    // Including when it disagrees about the state itself.
    expect(settle(guess, { hyped: false, hype_count: 4 })).toEqual({ hyped: false, count: 4 });
  });

  it("but an unreadable answer leaves the guess standing", () => {
    /*
     * The write succeeded — the RPC returned without error — so the one
     * thing that would be wrong is to show it as not having happened. An
     * older function or a shape change lands here.
     */
    const guess = optimistic({ hyped: false, count: 5 });
    for (const raw of [null, undefined, "nope", 7, [], {}]) {
      const out = settle(guess, raw as never);
      expect(out.hyped, `settled wrongly on ${JSON.stringify(raw)}`).toBe(true);
    }
    // `{}` reads as hyped:false with a NaN count, which is not a count —
    // so it is refused rather than rendered as "NaN".
    expect(settle(guess, {} as never)).toEqual(guess);
    expect(Number.isNaN(settle(guess, {} as never).count)).toBe(false);
  });

  it("and a negative count from the server is still floored", () => {
    // Belt and braces: the column has no constraint saying otherwise, and
    // "-1" rendered under a star is worse than "0".
    expect(settle({ hyped: true, count: 1 }, { hyped: false, hype_count: -1 })).toEqual({
      hyped: false,
      count: 0,
    });
  });

  it("a double-tap hypes and never un-hypes", () => {
    /*
     * The web's rule: a double-tap is a gesture of enthusiasm, and reading
     * the second tap as "take it back" makes an affectionate gesture
     * destructive.
     */
    expect(doubleTap({ hyped: false, count: 3 })).toEqual({
      next: { hyped: true, count: 4 },
      write: true,
    });
    const already = { hyped: true, count: 4 } as const;
    expect(doubleTap(already)).toEqual({ next: already, write: false });
  });

  it("both clients call it rather than keeping their own arithmetic", () => {
    const web = code(WEB_CARD);
    expect(web, "the web no longer imports the shared hype rules").toMatch(
      /import \{ optimistic, settle \} from "@\/lib\/hype"/,
    );
    expect(web, "the web is doing its own optimistic arithmetic again").not.toMatch(
      /setHypeCount\(\(c\) => c \+ \(prev \? -1 : 1\)\)/,
    );
    expect(web).toMatch(/const guess = optimistic\(/);
    expect(web).toMatch(/settle\(guess, data\)/);

    const hook = code("apps/mobile/src/feed/useHype.ts");
    expect(hook).toMatch(/from "@hypefy\/core\/hype"/);
    expect(hook).toMatch(/optimistic\(before\)/);
    expect(hook).toMatch(/settle\(guess, data\)/);
  });

  it("the phone calls the same RPC with the same three arguments", () => {
    const web = code(WEB_CARD);
    const hook = code("apps/mobile/src/feed/useHype.ts");
    for (const arg of ["p_target_type", "p_target_id", "p_owner_id"]) {
      expect(web, `the web no longer passes ${arg}`).toContain(arg);
      expect(hook, `the phone does not pass ${arg}`).toContain(arg);
    }
    expect(web).toMatch(/rpc\("toggle_hype"/);
    expect(hook).toMatch(/rpc\("toggle_hype"/);
    // "post", not a Shot or a Show: `hypes` is shared across all three.
    expect(hook).toMatch(/p_target_type: "post"/);
  });

  it("one tap at a time, and a failure restores what was there before", () => {
    /*
     * Two overlapping toggles on one row race, and whichever RPC answers
     * last wins — so the count settles on a value neither tap asked for.
     * The guard is what makes "roll back to before" and "roll back to the
     * opposite of now" the same thing.
     */
    const hook = code("apps/mobile/src/feed/useHype.ts");
    expect(hook).toMatch(/if \(pending\) return;/);
    expect(hook).toMatch(/const before = state;/);
    expect(hook, "the rollback does not restore the earlier state").toMatch(
      /catch \{\s*setState\(before\);/,
    );
    expect(hook, "pending is never cleared, so one failure wedges the button").toMatch(
      /finally \{\s*setPending\(false\);/,
    );
  });

  it("and the star says whether it is yours, to a screen reader too", () => {
    const src = body(CARD);
    expect(src).toMatch(/accessibilityLabel=\{hype\.state\.hyped \? "Remove your hype" : "Hype this post"\}/);
    expect(src).toMatch(/selected: hype\.state\.hyped/);
    expect(src).toMatch(/busy: hype\.pending/);
    // Filled and in the hype colour once it is yours, as the web's is.
    expect(src).toMatch(/fill=\{hype\.state\.hyped \? palette\.hype : "none"\}/);
    expect(code(WEB_CARD)).toMatch(/text-hype/);
  });

  it("the hypes query names the target type, or a Shot would fill a post's star", () => {
    /*
     * `hypes` is shared by posts, Shots and Shows. Without target_type a
     * hyped Shot whose id matched a post would show that post as hyped —
     * which is only possible because both are uuids, and is exactly the
     * kind of thing that would look like a caching bug.
     */
    const src = body(LOAD);
    expect(src).toMatch(/\.eq\("target_type", "post"\)/);
    expect(src).toMatch(/\.eq\("user_id", userId\)/);
    expect(code(WEB)).toMatch(/\.eq\("target_type", "post"\)/);
  });

  it("and asks for nothing when there is nothing to ask about", () => {
    // An empty `.in()` is not a query worth sending, and PostgREST renders
    // it awkwardly — the web says the same about its Shows query.
    expect(body(LOAD)).toMatch(/if \(postIds\.length === 0\) return new Set\(\);/);
  });

  it("the answer actually reaches the card, so the star arrives filled", () => {
    /*
     * Loading the set and never passing it is a complete, silent failure:
     * every post renders un-hyped, tapping one "works", and the next
     * refresh fills in stars the viewer never tapped. Mutation H26
     * replaced the lookup with `false` and nothing failed — the screen's
     * assertions were about the list, not about what it hands each row.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/hyped=\{hyped\.has\(item\.id\)\}/);
    expect(src, "the loaded set is never stored").toMatch(/setHyped\(result\.hyped\)/);
    expect(src, "the set is never loaded").toMatch(/loadHyped\(/);
  });
});
