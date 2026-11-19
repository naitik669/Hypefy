import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ENGAGEMENT_CAP,
  ageDecay,
  baseScore,
  engagementOf,
  hoursOld,
  recencyBoost,
} from "@/lib/discover-rank";
import { MAX_RUN, mixShots, mixShotsSplit } from "@/lib/discover-mix";

/**
 * Four reported faults in Shots and Discover.
 *
 * Measured against production on 15 Nov 2026, with nine Shots in the
 * catalogue — all live, all public, all with their media objects present.
 * That matters: none of these was an empty database.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const reels = code("src/components/shots/ReelsFeed.tsx");
const endCard = code("src/components/shots/ShotsEndCard.tsx");
const shotsPage = code("src/app/(app)/shots/page.tsx");
const shotPage = code("src/app/(app)/shots/[shotId]/page.tsx");
const discover = code("src/app/(app)/discover/page.tsx");

const NOW = new Date("2026-11-15T20:00:00Z").getTime();
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

describe("the reel does not declare the end before asking", () => {
  it("nothing is latched from the first batch's size", () => {
    // It was `useState(initialReels.length < 5)` — a guess against a magic 5
    // with a page size of 10. A catalogue of four declared itself finished
    // without fetching a single page, and the end card appeared.
    expect(reels).toContain("const [noMore, setNoMore] = useState(false);");
    expect(reels).not.toContain("useState(initialReels.length < 5)");
  });

  it("and only a short page sets it", () => {
    expect(reels).toContain("if ((data?.length ?? 0) < 10) setNoMore(true);");
  });
});

describe("the end card cannot read as an empty reel", () => {
  it("it says how many there were", () => {
    // Reported as "it says no more shots, create one" while nine existed.
    // The old copy was "That's every Shot for now. The reel is short: add one
    // of yours." next to a filled Make a Shot button.
    expect(endCard).toContain("That's all ${total} Shot${total === 1 ? \"\" : \"s\"} for now.");
    expect(endCard).not.toContain("That's every Shot for now. The reel is short");
  });

  it("and Make a Shot leads only when the reel is nearly empty", () => {
    // THIN_REEL is 20, so nine Shots counted as thin and the card led with
    // Make a Shot. `bare` is the narrower question the button should ask.
    expect(endCard).toContain("const bare = total < 5;");
    expect(endCard).toContain("className={bare ? main : quiet}");
  });

  it("the count comes from the reel rather than being assumed", () => {
    expect(reels).toContain("total={reels.length}");
  });
});

describe("a removed Shot is never served into a feed", () => {
  it("every Shot query excludes it", () => {
    // The select policy allows `removed_at is null OR user_id = auth.uid()
    // OR is_admin()`, which is right for an author's own archive and wrong
    // for a feed: a Shot a moderator took down was still served into its
    // author's reel, and every removed Shot into an admin's.
    for (const [name, src] of [
      ["reel candidates", shotsPage],
      ["reel pagination", reels],
      ["deep link", shotPage],
      ["discover", discover],
    ] as const) {
      expect(src, name).toContain('.is("removed_at", null)');
    }
  });

  it("including the deep link, which answers GoneScreen instead", () => {
    const at = shotPage.indexOf('.eq("id", shotId)');
    expect(at).toBeGreaterThan(-1);
    expect(shotPage.slice(at, at + 200)).toContain('.is("removed_at", null)');
    expect(shotPage).toContain('<GoneScreen kind="shot" />');
  });

  it("and the reel's later pages, not only its first", () => {
    // The first page is fetched on the server and the rest in the browser;
    // a filter on one and not the other is a feed that degrades as you
    // scroll.
    const at = reels.indexOf('.lt("created_at", oldest)');
    expect(at).toBeGreaterThan(-1);
    expect(reels.slice(at, at + 260)).toContain('.is("removed_at", null)');
  });
});

describe("Discover ranks new work where it can be found", () => {
  it("engagement is capped, as the Shots feed has always capped it", () => {
    expect(engagementOf({ hype_count: 1000 })).toBe(ENGAGEMENT_CAP);
    expect(engagementOf({ hype_count: 2, comment_count: 1 })).toBe(8);
  });

  it("and missing or negative counts are nought, not NaN", () => {
    expect(engagementOf({})).toBe(0);
    expect(engagementOf({ hype_count: null, save_count: -5 })).toBe(0);
  });

  it("engagement decays with age, so June cannot own November", () => {
    expect(ageDecay(1)).toBe(1);
    expect(ageDecay(48)).toBeLessThan(1);
    expect(ageDecay(3810)).toBeLessThan(ageDecay(48));
    // Never nought: an old popular thing should sink, not be erased, because
    // the pool is small enough that erasing it leaves gaps.
    expect(ageDecay(100_000)).toBeGreaterThan(0);
  });

  it("being new outscores old engagement", () => {
    // The real rows. aman's 10 June Shot (8 hypes, 5 comments, 2 saves,
    // 3 shares) scored 44 and chuglimaxxer's from 14 Nov scored 5, so all
    // four of the newest ranked last of nine.
    const june = { created_at: ago(3810), hype_count: 8, comment_count: 5, save_count: 2, share_count: 3 };
    const yesterday = { created_at: ago(35), hype_count: 2, share_count: 1 };
    const brandNew = { created_at: ago(30) };

    expect(baseScore(yesterday, NOW)).toBeGreaterThan(baseScore(june, NOW));
    // Even with nothing on it at all: that Shot being findable is the job.
    expect(baseScore(brandNew, NOW)).toBeGreaterThan(baseScore(june, NOW));
  });

  it("but engagement still decides between things of the same age", () => {
    // Decay must not flatten the ranking into pure recency.
    const quiet = { created_at: ago(30) };
    const loved = { created_at: ago(30), hype_count: 6 };
    expect(baseScore(loved, NOW)).toBeGreaterThan(baseScore(quiet, NOW));
  });

  it("and an unparseable date sinks rather than scoring infinitely", () => {
    expect(hoursOld("not a date", NOW)).toBe(Infinity);
    expect(recencyBoost(Infinity)).toBe(0);
    expect(Number.isFinite(baseScore({ created_at: "nope", hype_count: 3 }, NOW))).toBe(true);
  });

  it("and Discover actually uses the shared score", () => {
    /*
     * The arithmetic above can be perfect while the page keeps its own
     * formula — which is the state it was in: a local recencyBoost and
     * the raw counts added inline.
     *
     * The call is `discoverScore` now rather than `baseScore` directly.
     * The whole score moved into @hypefy/core/discover-rank when the Expo
     * client needed it — baseScore plus the three personal boosts, caps
     * included — so the page calls one function where it used to call one
     * and add three terms. Same assertion, one level up.
     */
    expect(discover).toContain("discoverScore(x, {");
    expect(discover).not.toContain("(x.hype_count ?? 0) * 3");
    expect(discover).not.toContain("function recencyBoost");
    // And the boosts are not back inline beside it.
    expect(discover).not.toContain("interests.size > 0 && tags.some");
  });

  it("one person's four Shots do not take the top four slots", () => {
    // What making recency dominant exposes: Discover never spread its Shots
    // by author, so the one person who posted four yesterday owned the top.
    expect(discover).toContain("diversify([...shots].sort");
  });
});

describe("Discover shows at most two Shot previews together", () => {
  const shot = (id: string) => ({ id });

  it("two is the cap", () => {
    expect(MAX_RUN).toBe(2);
  });

  it("no post to space them out, so the run is capped", () => {
    // The tail loop pushed EVERY leftover Shot back to back. With few posts
    // and several Shots — Hypefy today — the bottom of Discover was an
    // unbroken wall of video.
    const out = mixShots([], [shot("a"), shot("b"), shot("c"), shot("d")]);
    expect(out).toHaveLength(MAX_RUN);
    expect(out.every((m) => m.kind === "shot")).toBe(true);
  });

  it("but the capped ones are handed back, not thrown away", () => {
    // Capping and dropping would have been a fix for one complaint that
    // caused another: Discover not showing all the new Shots. PinFeed mixes
    // `rest` into the pages that load as you scroll.
    const shots = [shot("a"), shot("b"), shot("c"), shot("d")];
    const { mixed, rest } = mixShotsSplit([], shots);
    expect(mixed.filter((m) => m.kind === "shot")).toHaveLength(MAX_RUN);
    expect(rest.map((r) => r.id)).toEqual(["c", "d"]);
  });

  it("and the feed does mix them into the later pages", () => {
    // The guarantee lives in PinFeed, not in the helper: mixShotsSplit can
    // hand `rest` back to a caller that then ignores it.
    const pin = code("src/components/discover/PinFeed.tsx");
    expect(pin).toContain("mixShotsSplit(posts, shots)");
    expect(pin).toContain("mixShots(extra, rest)");
  });

  it("nothing is left unplaced once there are posts enough", () => {
    const posts = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` }));
    const { rest } = mixShotsSplit(posts, Array.from({ length: 5 }, (_, i) => shot(`s${i}`)));
    expect(rest).toHaveLength(0);
  });

  const longestRun = (out: { kind: string }[]) => {
    let run = 0;
    let worst = 0;
    for (const m of out) {
      run = m.kind === "shot" ? run + 1 : 0;
      worst = Math.max(worst, run);
    }
    return worst;
  };

  it("counting the Shots already at the end before adding more", () => {
    // One post and three Shots is the case that catches this: the spacing
    // loop ends ON a Shot, so the tail may add only one more. Counting the
    // run from zero instead lets three through — and a sweep that happens
    // to end on a post never notices.
    const out = mixShots([{ id: "p0" }], [shot("a"), shot("b"), shot("c")]);
    expect(out[out.length - 1].kind).toBe("shot");
    expect(longestRun(out)).toBeLessThanOrEqual(MAX_RUN);
  });

  it("and the longest run is two for every shape of feed", () => {
    // Swept rather than spot-checked: whether the spacing loop ends on a
    // post or a Shot depends on the ids, so one pair proves one path.
    for (let np = 0; np <= 12; np++) {
      for (let ns = 0; ns <= 12; ns++) {
        const out = mixShots(
          Array.from({ length: np }, (_, i) => ({ id: `p${i}` })),
          Array.from({ length: ns }, (_, i) => shot(`s${i}`)),
        );
        expect(longestRun(out), `posts=${np} shots=${ns}`).toBeLessThanOrEqual(MAX_RUN);
      }
    }
  });

  it("the posts are all still there", () => {
    // Capping the Shots must not drop a post.
    const posts = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}` }));
    const out = mixShots(posts, Array.from({ length: 9 }, (_, i) => shot(`s${i}`)));
    expect(out.filter((m) => m.kind === "post")).toHaveLength(posts.length);
  });

  it("and a feed with room for them keeps spacing them as before", () => {
    // The gap logic was never the problem; the tail loop that ignored it was.
    const posts = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` }));
    const out = mixShots(posts, [shot("a"), shot("b"), shot("c")]);
    expect(out.filter((m) => m.kind === "shot")).toHaveLength(3);
    for (let i = 1; i < out.length; i++) {
      if (out[i].kind === "shot") expect(out[i - 1].kind).toBe("post");
    }
  });
});
