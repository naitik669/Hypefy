import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  optimisticFollow,
  settleFollow,
  followAction,
  followLabel,
  isLocked,
} from "../packages/core/src/follow";
import { bannerColors, parseBannerGradient } from "../packages/core/src/banner-colors";
import { BANNERS, DEFAULT_BANNER_ID, hueFromId } from "../packages/core/src/profile";
import { PROFILE_COLUMNS } from "../apps/mobile/src/profile/load";
import { GRID_COLUMNS, GRID_LIMIT, firstMedia } from "../apps/mobile/src/profile/posts";
import { toHex, alphaOf } from "../apps/mobile/src/profile/css-color";

/**
 * The phone's profile screen.
 *
 * The first screen reached from a PERSON, so the first navigation that
 * carries a username and the first screen that can be somebody else's.
 * Three states exist here that no earlier screen had: a profile that does
 * not exist, a private one, and the viewer's own.
 */

const WEB = "src/app/(app)/u/[username]/page.tsx";
const WEB_BUTTON = "src/components/profile/FollowButton.tsx";
const LOAD = "apps/mobile/src/profile/load.ts";
const POSTS = "apps/mobile/src/profile/posts.ts";
const SCREEN = "apps/mobile/app/u/[username].tsx";
const TAB = "apps/mobile/app/(tabs)/profile.tsx";
const CARD = "apps/mobile/src/feed/FeedCard.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Comments and imports gone — both have stood in for code in this repo. */
function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

/** Comments gone, imports kept. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("following is one rule for both clients", () => {
  it("the web imports it rather than keeping its own", () => {
    const web = code(WEB_BUTTON);
    expect(web).toMatch(/from "@\/lib\/follow"/);
    expect(web, "the web decides the RPC for itself again").not.toMatch(
      /prev === "none"\) \{/,
    );
    expect(web).toMatch(/optimisticFollow\(prev\)/);
    expect(web).toMatch(/settleFollow\(data\)/);
    expect(web).toMatch(/followAction\(prev\)/);
  });

  it("a follow of a PRIVATE account comes back as requested, not following", () => {
    /*
     * The reason this is shared at all. A client that assumes "follow
     * succeeded means following" shows Following for a request nobody has
     * accepted — and the person then wonders why they still cannot see
     * anything.
     */
    expect(settleFollow("requested")).toBe("requested");
    expect(settleFollow(null)).toBe("following");
    expect(settleFollow("ok")).toBe("following");
    expect(settleFollow(undefined)).toBe("following");
  });

  it("unfollow covers cancelling a request as well", () => {
    /*
     * Three states, two actions. Getting this wrong leaves a pending
     * request with no way to withdraw it, which looks like the button
     * doing nothing.
     */
    expect(followAction("none")).toBe("follow_user");
    expect(followAction("following")).toBe("unfollow_user");
    expect(followAction("requested")).toBe("unfollow_user");
  });

  it("the optimistic guess is Following even for a private account", () => {
    /*
     * Deliberate, and the web's own behaviour: the correction arrives in
     * the same breath, and guessing "Requested" first would be a claim
     * about the other person's privacy setting made from a possibly stale
     * profile row.
     */
    expect(optimisticFollow("none")).toBe("following");
    expect(optimisticFollow("following")).toBe("none");
    expect(optimisticFollow("requested")).toBe("none");
  });

  it("the three words, and only the first is a caller's to rename", () => {
    expect(followLabel("none")).toBe("Follow");
    expect(followLabel("following")).toBe("Following");
    expect(followLabel("requested")).toBe("Requested");
    expect(followLabel("none", "Follow back")).toBe("Follow back");
    expect(followLabel("following", "Follow back")).toBe("Following");
  });
});

describe("a private account is locked until the follow is accepted", () => {
  it("a pending REQUEST does not unlock anything", () => {
    /*
     * The whole point of a request. A client that treats "I tapped
     * follow" as access shows an empty grid and makes the viewer think
     * the person has no posts.
     */
    expect(isLocked({ isPrivate: true, isOwn: false, state: "requested" })).toBe(true);
    expect(isLocked({ isPrivate: true, isOwn: false, state: "none" })).toBe(true);
    expect(isLocked({ isPrivate: true, isOwn: false, state: "following" })).toBe(false);
  });

  it("the owner always sees their own, and a public account is never locked", () => {
    expect(isLocked({ isPrivate: true, isOwn: true, state: "none" })).toBe(false);
    expect(isLocked({ isPrivate: false, isOwn: false, state: "none" })).toBe(false);
  });

  it("and the screen does not ask for a locked grid at all", () => {
    /*
     * RLS would refuse it anyway, and asking makes "private" and "empty"
     * indistinguishable in the one place where the difference is the
     * point.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/found\.locked\s*\?\s*\[\]/);
    expect(src).toMatch(/This account is private/);
    // And it says which of the two private states the viewer is in.
    expect(src).toMatch(/Your request is waiting to be accepted/);
    expect(src).toMatch(/Follow to see their posts/);
  });
});

describe("the counts are the website's counts", () => {
  it("Posts includes Shots, as the web's does", () => {
    /*
     * Copying the arithmetic matters more than agreeing with it: a profile
     * that says 12 on the site and 9 on the phone is a bug report nobody
     * can diagnose.
     */
    const web = code(WEB);
    expect(web).toMatch(/from\("shots"\)[\s\S]{0,120}count: "exact"/);
    expect(web).toMatch(/\(postsRes\.count \?\? 0\) \+ \(shotsRes\.count \?\? 0\)/);
    const src = body(LOAD);
    expect(src).toMatch(/\(posts\.count \?\? 0\) \+ \(shots\.count \?\? 0\)/);
  });

  it("followers and following are the two directions of the same table", () => {
    // Swapping these is the classic silent error: both are counts of
    // `follows`, and the only difference is which column is filtered.
    const src = body(LOAD);
    expect(src).toMatch(/\.eq\("following_id", userId\)/);
    expect(src).toMatch(/\.eq\("follower_id", userId\)/);
    expect(src).toMatch(/followers: followers\.count \?\? 0/);
    expect(src).toMatch(/following: following\.count \?\? 0/);
  });

  it("and they are counted without fetching any rows", () => {
    const src = body(LOAD);
    expect([...src.matchAll(/count: "exact", head: true/g)].length).toBe(4);
  });

  it("the grid says so when the count is larger than the tiles", () => {
    /*
     * Because Posts includes Shots and the grid is posts only. Left
     * unexplained it reads as a missing-posts bug.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/view\.stats\.posts > posts\.length/);
    expect(src).toMatch(/count includes Shots/);
  });
});

describe("the lookup is the website's lookup", () => {
  it("by lower-cased username, and only a completed profile", () => {
    /*
     * Usernames are stored lower-case, so a link shared with different
     * capitalisation must still resolve. And an account that signed up
     * and never finished setup has a row with no profile — showing it as
     * an empty person is worse than a not-found.
     */
    const web = code(WEB);
    expect(web).toMatch(/\.eq\("username", username\.toLowerCase\(\)\)/);
    expect(web).toMatch(/\.eq\("profile_completed", true\)/);
    const src = body(LOAD);
    expect(src).toMatch(/\.eq\("username", username\.toLowerCase\(\)\)/);
    expect(src).toMatch(/\.eq\("profile_completed", true\)/);
  });

  it("follow and request are two tables, asked separately", () => {
    /*
     * A request is not a follow. Checking only `follows` makes a pending
     * request look like "not following", so the button offers to send the
     * same request again.
     */
    const src = body(LOAD);
    expect(src).toMatch(/from\("follows"\)/);
    expect(src).toMatch(/from\("follow_requests"\)/);
    expect(src).toMatch(/if \(follow\.data\) return "following";/);
    expect(src).toMatch(/if \(request\.data\) return "requested";/);
  });

  it("asks for the columns the screen renders, and no more", () => {
    /*
     * Deliberately not core's PUBLIC_PROFILE_COLUMNS, which is forty
     * columns including every cosmetic. The database refuses select("*")
     * on profiles either way, so the list is explicit regardless.
     */
    for (const column of [
      "id",
      "username",
      "display_name",
      "bio",
      "avatar_url",
      "avatar_hue",
      "banner_id",
      "profile_tags",
      "is_private",
      "is_verified",
      "pronouns",
    ]) {
      expect(PROFILE_COLUMNS, `${column} is not asked for`).toMatch(
        new RegExp(`(^|[ ,])${column}[,\\s]`),
      );
    }
    expect(PROFILE_COLUMNS, "the cosmetic columns are being pulled for nothing").not.toMatch(
      /name_font|name_glow|avatar_decoration|nameplate/,
    );
  });

  it("the grid asks for one author, newest first", () => {
    const src = body(POSTS);
    expect(src).toMatch(/\.eq\("user_id", userId\)/);
    expect(src).toMatch(/\.order\("created_at", \{ ascending: false \}\)/);
    expect(src).toMatch(new RegExp(`\\.limit\\(GRID_LIMIT\\)`));
    expect(GRID_LIMIT % 3, "the grid limit does not fill whole rows of three").toBe(0);
    for (const column of ["id", "media_url", "media_urls", "caption"]) {
      expect(GRID_COLUMNS).toMatch(new RegExp(`(^|[ ,])${column}[,\\s]|${column}$`));
    }
  });

  it("and a gallery's first picture is the tile", () => {
    expect(firstMedia({ media_url: "a.jpg", media_urls: null })).toBe("a.jpg");
    expect(firstMedia({ media_url: "a.jpg", media_urls: ["b.jpg", "c.jpg"] })).toBe("b.jpg");
    expect(firstMedia({ media_url: null, media_urls: [] })).toBeNull();
    expect(firstMedia({ media_url: null, media_urls: null })).toBeNull();
  });
});

describe("the banner's colours come out of the web's own CSS", () => {
  it("every banner the web declares can be drawn on the phone", () => {
    /*
     * The assertion that makes this approach safe rather than clever. A
     * seventh banner in a shape the parser does not understand fails here
     * rather than rendering as a black rectangle on a phone.
     */
    expect(BANNERS.length).toBeGreaterThan(0);
    for (const banner of BANNERS) {
      const parsed = parseBannerGradient(banner.gradient);
      expect(parsed, `${banner.id} cannot be parsed`).toBeTruthy();
      expect(parsed?.base, `${banner.id} has no base colour`).toBeTruthy();
    }
  });

  it("the base colour is the last one, because CSS paints back to front", () => {
    expect(parseBannerGradient("radial-gradient(1px at 0 0, rgba(1,2,3,0.4), transparent), #0d0d0d")).toEqual({
      base: "#0d0d0d",
      accent: "rgba(1,2,3,0.4)",
    });
    expect(parseBannerGradient("linear-gradient(135deg, #2a1a4a 0%, #140f24 60%, #0b0b14 100%)")).toEqual({
      base: "#0b0b14",
      accent: "#2a1a4a",
    });
  });

  it("a single colour has no accent, and no colour at all is null", () => {
    expect(parseBannerGradient("#123456")).toEqual({ base: "#123456", accent: null });
    expect(parseBannerGradient("none")).toBeNull();
  });

  it("an unknown id falls back to the default banner, as bannerGradient does", () => {
    const fallback = BANNERS.find((b) => b.id === DEFAULT_BANNER_ID);
    expect(fallback, "the default banner is missing from BANNERS").toBeTruthy();
    expect(bannerColors("no-such-banner")).toEqual(
      parseBannerGradient(fallback?.gradient ?? ""),
    );
    expect(bannerColors(null)).toEqual(bannerColors(undefined));
  });

  it("and rgba is split into a colour and an opacity, as SVG needs", () => {
    // CSS puts both in one function; SVG takes them separately, and an
    // rgba() string handed to a stop renders as nothing.
    expect(toHex("rgba(163,230,53,0.40)")).toBe("#a3e635");
    expect(alphaOf("rgba(163,230,53,0.40)")).toBe(0.4);
    expect(toHex("#0d0d0d")).toBe("#0d0d0d");
    expect(alphaOf("#0d0d0d")).toBe(1);
    expect(toHex("rgb(10,20,30)")).toBe("#0a141e");
    expect(alphaOf("rgb(10,20,30)")).toBe(1);
  });

  it("the accent really is one of the web's palette colours", () => {
    // The lime banner's tint is the accent at 40%, which is where this
    // whole approach would break silently if the parse picked the wrong
    // end of the gradient.
    const lime = BANNERS.find((b) => b.id === "lime-pulse");
    expect(lime, "the default lime banner has gone").toBeTruthy();
    expect(toHex(bannerColors("lime-pulse").accent ?? "")).toBe("#a3e635");
  });
});

describe("the fallback avatar colour is the website's", () => {
  it("hueFromId, not a colour of the phone's own", () => {
    const src = body(LOAD);
    expect(src).toMatch(/hueFromId\(profile\.id\)/);
    // And the stored hue wins when there is one.
    expect(src).toMatch(/profile\.avatar_hue \?\? hueFromId\(profile\.id\)/);
    // Same id, same hue, on both clients.
    expect(hueFromId("abc")).toBe(hueFromId("abc"));
  });
});

describe("following writes through the website's own RPCs", () => {
  it("follow_user and unfollow_user, not an insert", () => {
    /*
     * They are SECURITY DEFINER and own the follow row, its notification,
     * and the private-account request. An insert into `follows` skips all
     * three.
     */
    const src = body(LOAD);
    expect(src).toMatch(/rpc\(rpc, \{ p_target: targetId \}\)/);
    expect(src, "the phone inserts follows directly").not.toMatch(
      /from\("follows"\)[\s\S]{0,60}\.insert/,
    );
    expect(code(WEB_BUTTON)).toMatch(/rpc\("follow_user"/);
    expect(code(WEB_BUTTON)).toMatch(/rpc\("unfollow_user"/);
  });

  it("a failure puts the button back and says why", () => {
    /*
     * The web's note: a follow that silently reverts is the one failure
     * that quietly produces an empty feed later.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/setState\(before\)/);
    expect(src).toMatch(/setFollowError\(result\.error\)/);
    expect(src).toMatch(/\{followError\}/);
    // Postgres's own message, not one catch-all sentence.
    expect(body(LOAD)).toMatch(/"message" in error/);
  });

  it("one tap at a time", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/if \(pending \|\| !view\) return;/);
    expect(src).toMatch(/setPending\(false\)/);
  });

  it("and Following is quieter than Follow, as the web decided", () => {
    /*
     * Follow is a thing to do; Following is a state you are already in.
     * The web has its own test saying so; this is the phone's.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/followOn: \{\s*backgroundColor: "transparent"/);
    expect(src).toMatch(/followText: \{ color: palette\.accentInk/);
    expect(src).toMatch(/followTextOn: \{ color: palette\.foreground \}/);
  });
});

describe("the screen can be reached, and left", () => {
  it("the route is the website's path, so a shared link lands here", () => {
    expect(existsSync(SCREEN)).toBe(true);
    // /u/[username] on both.
    expect(existsSync(WEB)).toBe(true);
  });

  it("a face and a name in the feed both reach it", () => {
    const src = body(CARD);
    expect(src).toMatch(/function openProfile\(/);
    expect(src).toMatch(/pathname: "\/u\/\[username\]"/);
    // Both the avatar and the name, as the web links both.
    expect(
      [...src.matchAll(/onPress=\{\(\) => openProfile\(profile\?\.username\)\}/g)].length,
      "the face and the name do not both open the profile",
    ).toBe(2);
  });

  it("and it pushes rather than replaces, so Back returns to the feed", () => {
    /*
     * `replace` leaves nowhere to go back to, which on Android means the
     * hardware button leaves the app from a profile. Asserted here as well
     * as for comments, because mutation P48 showed the comments test was
     * the only thing covering it — and it does not run when this screen's
     * suite does.
     */
    const src = body(CARD);
    expect(src).toMatch(/router\.push\(\{ pathname: "\/u\/\[username\]"/);
    expect(src, "the card replaces the feed instead of stacking").not.toMatch(
      /router\.replace\(\{ pathname: "\/u/,
    );
  });

  it("and a tap with no username to open does nothing rather than failing", () => {
    /*
     * /u/[username] has nothing to resolve, and a tap that lands on "no
     * such profile" is worse than one that does nothing.
     */
    const src = body(CARD);
    expect(src).toMatch(/disabled=\{!profile\?\.username\}/);
    expect(src).toMatch(/if \(!username\) return;/);
  });

  it("the Profile tab hands over rather than drawing its own", () => {
    /*
     * A tab that drew its own version of a profile is how the two would
     * drift. The only difference between mine and someone else's is the
     * Follow button, which that screen already knows about.
     */
    const src = body(TAB);
    expect(src).toMatch(/pathname: "\/u\/\[username\]"/);
    expect(src, "the tab is rendering a second profile").not.toMatch(/loadProfile/);
  });

  it("and sign-out is reachable in every state the tab has", () => {
    /*
     * The #78 defect, asserted from here too: a screen behind auth must
     * not become another dead end.
     *
     * Counted, not merely present. The tab renders it twice — once in the
     * footer of the loaded state and once beside the "not set up" message
     * — and mutation P50 deleted the footer one while the other kept the
     * assertion green. Both states need it: an account with no username
     * cannot reach the profile at all, so the footer's copy is no use to
     * it, and vice versa.
     */
    const src = body(TAB);
    expect(
      [...src.matchAll(/<SignOutRow\s*\/?>/g)].length,
      "a state of the Profile tab has lost its sign-out",
    ).toBe(2);
    // One of them is inside the footer the loaded state renders.
    const footer = src.slice(src.indexOf("footer={"));
    expect(footer, "the loaded profile tab has no sign-out").toMatch(/<SignOutRow\s*\/?>/);
  });

  it("there is a back control as well as the system gesture", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/accessibilityLabel="Back"/);
    expect(src).toMatch(/router\.back\(\)/);
  });

  it("the tab says so when the account has no username yet", () => {
    /*
     * The web sends them to /setup-profile, which is not ported — so this
     * says what to do rather than routing nowhere, and keeps sign-out
     * available while it does.
     */
    const src = body(TAB);
    expect(src).toMatch(/no-username/);
    expect(src).toMatch(/Finish setting up your profile/);
    expect(src).toMatch(/<SignOutRow \/>/);
  });
});

describe("the four states this screen has that no earlier one did", () => {
  it("missing, failed, loading, and loaded", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/No such profile/);
    expect(src).toMatch(/Could not load this profile/);
    expect(src).toMatch(/ActivityIndicator/);
    expect(src).toMatch(/accessibilityLabel="Try again"/);
  });

  it("a missing profile is not reported as an error", () => {
    /*
     * Different things: "no such person" is an answer, "could not ask" is
     * a failure. Collapsing them tells someone to retry a URL that will
     * never work.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/kind: "missing"/);
    expect(src).toMatch(/setMissing\(true\)/);
    const missing = src.slice(src.indexOf("if (missing)"), src.indexOf("if (error)"));
    expect(missing, "the missing state offers a retry").not.toMatch(/Try again/);
  });

  it("and a text-only post still takes a tile", () => {
    // A blank square reads as a broken image.
    const src = body(SCREEN);
    expect(src).toMatch(/cellText/);
    expect(src).toMatch(/\{item\.caption\}/);
  });

  it("what is not ported is written down where someone will read it", () => {
    const src = read(LOAD);
    for (const absent of ["Showcases", "Shots and Collections", "Message", "cosmetics"]) {
      expect(src, `${absent} is no longer recorded as absent`).toContain(absent);
    }
  });
});
