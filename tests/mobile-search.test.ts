import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { searchScope, searchFailed, latestOnly } from "../packages/core/src/search-run";
import { buildSections, type SearchRow } from "../apps/mobile/src/search/rows";
import {
  search,
  normaliseSearchPost,
  NO_RESULTS,
  SEARCH_POST_COLUMNS,
  PEOPLE_LIMIT,
  POST_LIMIT,
  type SearchResults,
} from "../apps/mobile/src/search/load";

/**
 * Search on the phone.
 *
 * Two rules decide whether this screen is right, and both are shared:
 * which questions a query asks, and the difference between a search that
 * found nothing and one that failed.
 */

const WEB = "src/app/(app)/search/page.tsx";
const LOAD = "apps/mobile/src/search/load.ts";
const SCREEN = "apps/mobile/app/search.tsx";
const TOPBAR = "apps/mobile/src/TopBar.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the prefixes mean the same thing on both clients", () => {
  it("@ is people only, # is everything but people", () => {
    /*
     * Not cosmetic. `@` returning posts puts a stranger's photograph
     * above the person being looked for, and `#` returning people is a
     * list of accounts for a topic query.
     */
    expect(searchScope("@maya")).toEqual({
      term: "@maya",
      people: true,
      posts: false,
      shots: false,
      kind: "user",
    });
    expect(searchScope("#art")).toEqual({
      term: "#art",
      people: false,
      posts: true,
      shots: true,
      kind: "tag",
    });
    expect(searchScope("maya")).toEqual({
      term: "maya",
      people: true,
      posts: true,
      shots: true,
      kind: "all",
    });
  });

  it("the term keeps its prefix, because the RPCs take it as typed", () => {
    expect(searchScope("  @maya  ").term).toBe("@maya");
    expect(searchScope("   ").term).toBe("");
  });

  it("and the web asks it rather than deciding for itself", () => {
    const web = code(WEB);
    expect(web).toMatch(/searchScope\(trimmed\)/);
    expect(web, "the web reads the prefixes for itself again").not.toMatch(
      /const isTag = trimmed\.startsWith/,
    );
  });
});

describe("a failed search is not an empty one", () => {
  it("every part that was ASKED for must have errored", () => {
    /*
     * The distinction is the point: "nothing matched" sends someone away
     * believing their friend is not on Hypefy; "search is not working"
     * sends them back in a minute.
     */
    expect(searchFailed([{ error: "x" }, { error: "y" }])).toBe(true);
    expect(searchFailed([{ error: "x" }, { error: null }])).toBe(false);
    expect(searchFailed([{ error: null }])).toBe(false);
  });

  it("and nothing asked is not a failure", () => {
    // An empty query asks nothing. Reporting that as a broken search
    // would greet everyone who opens the screen with an error.
    expect(searchFailed([])).toBe(false);
    expect(NO_RESULTS.failed).toBe(false);
    expect(NO_RESULTS.people).toEqual([]);
    expect(NO_RESULTS.posts).toEqual([]);
  });

  it("a part that was never asked for does not count", () => {
    /*
     * Under `@`, posts are not asked for — so a null, error-free
     * placeholder must not be read as a successful part that would mask
     * a genuine failure of the people search.
     */
    const src = body(LOAD);
    expect(src).toMatch(/scope\.people \? peopleRes : null/);
    expect(src).toMatch(/scope\.posts \? postsRes : null/);
    expect(src).toMatch(/searchFailed\(asked\)/);
  });

  it("the screen says which of the two it is", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/Search is not working/);
    expect(src).toMatch(/Nothing matched/);
    expect(src).toMatch(/results\.failed/);
  });

  it("and the empty message fits what was asked", () => {
    // "No account with that name" under `@`, not "try a different word".
    const src = body(SCREEN);
    expect(src).toMatch(/No account with that name/);
    expect(src).toMatch(/Nothing posted with that tag yet/);
    expect(src).toMatch(/results\.scope\.kind === "user"/);
  });
});

describe("only the newest answer may speak", () => {
  it("latestOnly, from core, is what decides", () => {
    /*
     * Answers do not come back in the order the questions went out —
     * "ab" can arrive after "abc" — and without this the late answer to
     * the older question replaces the results for what is actually in
     * the box.
     */
    const runs = latestOnly();
    const first = runs.begin();
    const second = runs.begin();
    expect(runs.isCurrent(second)).toBe(true);
    expect(runs.isCurrent(first)).toBe(false);
  });

  it("the screen uses it, and returns rather than setting state", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/latestOnly\(\)/);
    expect(src).toMatch(/const run = runs\.begin\(\)/);
    expect(
      [...src.matchAll(/if \(!runs\.isCurrent\(run\)\) return;/g)].length,
      "a path can still set state from a stale answer",
    ).toBeGreaterThanOrEqual(2);
  });

  it("and typing is debounced rather than asking per keystroke", () => {
    // On a phone that is a request per character over a mobile
    // connection, and the answers then race each other for no benefit.
    /*
     * The ask must be INSIDE the timer. Asserting that a setTimeout and
     * DEBOUNCE_MS both appear was satisfied by a mutation that called
     * ask() immediately and left an empty timer beside it (S27).
     */
    const src = body(SCREEN);
    const effect = src.slice(src.indexOf("useEffect(() => {"), src.indexOf("const sections"));
    expect(effect.length, "the debounce effect could not be found").toBeGreaterThan(0);
    expect(effect).toMatch(/setTimeout\(\(\) => \{\s*void ask\(query\);\s*\}, DEBOUNCE_MS\)/);
    expect(effect, "the debounce timer is never cleared").toMatch(/clearTimeout\(timer\)/);
    expect(
      [...effect.matchAll(/void ask\(query\)/g)].length,
      "ask is called outside the timer as well",
    ).toBe(1);
  });
});

describe("what search actually asks for, by running it", () => {
  /*
   * Called with a stub client rather than read as source — which is what
   * nine of my first assertions should have been. `search` takes its
   * client as an argument precisely so this is possible, and a stub makes
   * the questions it asks observable instead of inferred.
   */
  type Call = { fn: string; args: Record<string, unknown> | undefined };

  function stub(answers: Record<string, { data?: unknown; error?: unknown }> = {}) {
    const calls: Call[] = [];
    const client = {
      rpc(fn: string, args?: Record<string, unknown>) {
        calls.push({ fn, args });
        const answer = answers[fn] ?? { data: [], error: null };
        const result = { data: answer.data ?? [], error: answer.error ?? null };
        // `search_posts` is chained with `.select(...)` on the web and here,
        // so the stub has to be thenable AND chainable.
        return {
          select: () => Promise.resolve(result),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
        };
      },
    };
    return { client, calls };
  }

  it("an empty query asks nothing at all", async () => {
    const { client, calls } = stub();
    const out = await search(client as never, "   ");
    expect(calls, "an empty box sent a query").toEqual([]);
    expect(out).toEqual(NO_RESULTS);
  });

  it("a plain query asks for people and posts", async () => {
    const { client, calls } = stub();
    await search(client as never, "maya");
    expect(calls.map((c) => c.fn).sort()).toEqual(["search_people", "search_posts"]);
    expect(calls[0].args).toEqual({ p_q: "maya", p_limit: PEOPLE_LIMIT });
  });

  it("@ asks for people and NOT posts", async () => {
    const { client, calls } = stub();
    await search(client as never, "@maya");
    expect(calls.map((c) => c.fn)).toEqual(["search_people"]);
    // The prefix goes through to the RPC, as the web sends it.
    expect(calls[0].args).toEqual({ p_q: "@maya", p_limit: PEOPLE_LIMIT });
  });

  it("# asks for posts and NOT people", async () => {
    const { client, calls } = stub();
    await search(client as never, "#art");
    expect(calls.map((c) => c.fn)).toEqual(["search_posts"]);
    expect(calls[0].args).toEqual({ p_q: "#art", p_limit: POST_LIMIT });
  });

  it("never asks for Shots, because nothing renders one", async () => {
    const { client, calls } = stub();
    await search(client as never, "art");
    expect(calls.map((c) => c.fn)).not.toContain("search_shots");
  });

  it("every part failing is a failed search, with no rows read", async () => {
    /*
     * The failure path must RETURN `failed`, not throw: the screen has a
     * better thing to say ("Search is not working") than a Postgres
     * message, and reading the rows of an errored answer would throw
     * before it got there. Mutation S11 deleted that early return and
     * every source-based assertion stayed green.
     */
    const { client } = stub({
      search_people: { error: { message: "boom" } },
      search_posts: { error: { message: "boom" } },
    });
    const out = await search(client as never, "maya");
    expect(out.failed).toBe(true);
    expect(out.people).toEqual([]);
    expect(out.posts).toEqual([]);
  });

  it("one part failing still shows the half that worked", async () => {
    /*
     * This test found a real defect. The loader read every asked-for part
     * through `rows`, which throws — so people failing took the posts
     * down with it and the whole search errored. A broken half must not
     * lose the half that worked.
     */
    const { client } = stub({
      search_people: { error: { message: "boom" } },
      search_posts: { data: [{ id: "p1" }] },
    });
    const out = await search(client as never, "maya");
    expect(out.failed).toBe(false);
    expect(out.people).toEqual([]);
    expect(out.posts.map((p) => p.id)).toEqual(["p1"]);
  });

  it("and the other way round", async () => {
    const { client } = stub({
      search_people: { data: [{ id: "u1" }] },
      search_posts: { error: { message: "boom" } },
    });
    const out = await search(client as never, "maya");
    expect(out.failed).toBe(false);
    expect(out.people.map((p) => p.id)).toEqual(["u1"]);
    expect(out.posts).toEqual([]);
  });

  it("and a part that was never asked for cannot mask a failure", async () => {
    /*
     * Under `@` only people are asked. If the unasked posts placeholder
     * counted as a successful part, a total failure of the people search
     * would read as "nothing matched".
     */
    const { client } = stub({ search_people: { error: { message: "boom" } } });
    const out = await search(client as never, "@maya");
    expect(out.failed, "a skipped part masked the one real failure").toBe(true);
  });

  it("the rows that come back are normalised", async () => {
    const { client } = stub({
      search_people: { data: [{ id: "u1", username: "maya" }] },
      search_posts: { data: [{ id: "p1", profiles: [{ display_name: "Maya" }] }] },
    });
    const out = await search(client as never, "maya");
    expect(out.people.map((p) => p.id)).toEqual(["u1"]);
    expect(out.posts[0].profiles?.display_name).toBe("Maya");
  });
});

describe("the queries are the website's queries", () => {
  it("the same RPCs at the same limits", () => {
    const web = code(WEB);
    const src = body(LOAD);
    expect(web).toMatch(/search_people", \{ p_q: trimmed, p_limit: 20 \}/);
    expect(PEOPLE_LIMIT).toBe(20);
    expect(web).toMatch(/search_posts", \{ p_q: trimmed, p_limit: 24 \}/);
    expect(POST_LIMIT).toBe(24);
    expect(src).toMatch(/rpc\("search_people"/);
    expect(src).toMatch(/rpc\("search_posts"/);
  });

  it("ranked RPCs, not a LIKE the phone writes itself", () => {
    /*
     * The web's note: `ilike '%term%'` had no notion of a better match,
     * so the top result for any live topic was the oldest popular post
     * about it — and the term was interpolated into PostgREST's `or=`
     * filter, where a comma is syntax, so "hey, you" returned wrong
     * results rather than poor ones.
     */
    const src = body(LOAD);
    expect(src, "the phone is building its own text search").not.toMatch(/ilike|\.or\(/);
  });

  it("asked together, not one after another", () => {
    const src = body(LOAD);
    expect(src).toMatch(/Promise\.all\(/);
  });

  it("and an embedded profile is read whether it is a row or a list", () => {
    expect(
      normaliseSearchPost({ id: "a", profiles: { display_name: "Maya" } }).profiles
        ?.display_name,
    ).toBe("Maya");
    expect(
      normaliseSearchPost({ id: "a", profiles: [{ display_name: "Maya" }] }).profiles
        ?.display_name,
    ).toBe("Maya");
    expect(normaliseSearchPost({ id: "a", profiles: [] }).profiles).toBeNull();
  });

  it("the post columns name the join, as a two-key table needs", () => {
    expect(SEARCH_POST_COLUMNS).toContain("profiles!posts_user_id_fkey");
  });

  it("and ask for everything a result row renders", () => {
    /*
     * tests/mobile-columns.test.ts proves every column asked for EXISTS.
     * This is the other direction: everything the row draws is asked for.
     * Dropping one leaves a result with no picture and nothing failing —
     * mutation S16 removed image_url and the schema check was satisfied,
     * because every remaining column was real.
     */
    for (const column of [
      "image_url",
      "image_urls",
      "caption",
      "hype_count",
      "comment_count",
      "user_id",
    ]) {
      expect(SEARCH_POST_COLUMNS, `${column} is not asked for`).toMatch(
        new RegExp(`(^|[ ,])${column}[,\\s]`),
      );
    }
    // And the screen really does render each of them.
    const src = body(SCREEN);
    expect(src).toMatch(/post\.image_urls\?\.\[0\] \?\? post\.image_url/);
    expect(src).toMatch(/post\.hype_count/);
    expect(src).toMatch(/post\.comment_count/);
  });
});

describe("the rows the screen builds", () => {
  const person = (id: string) => ({
    id,
    display_name: `Name ${id}`,
    username: id,
    avatar_hue: 200,
    avatar_url: null,
    is_verified: false,
  });
  const post = (id: string) => ({
    id,
    caption: "hello",
    image_url: null,
    image_urls: null,
    created_at: "2026-11-19T00:00:00.000Z",
    user_id: "u",
    hype_count: 0,
    comment_count: 0,
    profiles: null,
  });
  const results = (over: Partial<SearchResults>): SearchResults => ({
    ...NO_RESULTS,
    ...over,
  });

  it("a heading only when its section has something in it", () => {
    /*
     * A "People" heading over nothing reads as a section that failed to
     * load, which is the same confusion the failed/empty distinction
     * exists to avoid.
     */
    const onlyPeople = buildSections(results({ people: [person("a")] }));
    expect(onlyPeople.map((r: SearchRow) => r.kind)).toEqual(["heading", "person"]);
    const onlyPosts = buildSections(results({ posts: [post("x")] }));
    expect(onlyPosts.map((r: SearchRow) => r.kind)).toEqual(["heading", "post"]);
    expect(buildSections(NO_RESULTS)).toEqual([]);
  });

  it("people before posts, as the web orders them", () => {
    const both = buildSections(results({ people: [person("a")], posts: [post("x")] }));
    expect(both.map((r: SearchRow) => r.kind)).toEqual(["heading", "person", "heading", "post"]);
  });

  it("and every key says which kind of row it is", () => {
    /*
     * Both are uuids from different tables; an id shared by chance would
     * make React reconcile the wrong row.
     *
     * The first version only asserted the keys were distinct, which held
     * when ONE of the two prefixes was removed — mutations S23 and S24
     * each survived it. The prefix is the mechanism, so that is what is
     * asserted.
     */
    const both = buildSections(results({ people: [person("same")], posts: [post("same")] }));
    const keys = both.map((r: SearchRow) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const row of both) {
      const prefix = row.kind === "heading" ? "h-" : row.kind === "person" ? "p-" : "o-";
      expect(row.key.startsWith(prefix), `${row.kind} key "${row.key}" is not prefixed`).toBe(
        true,
      );
    }
  });
});

describe("the screen can be reached, and left", () => {
  it("search is a destination in core, with a mapped icon", () => {
    const nav = read("packages/core/src/navigation.ts");
    expect(nav).toMatch(/href: "\/search"/);
    expect(read("apps/mobile/src/icon-map.ts")).toMatch(
      /"\/search": \{ kind: "lucide", name: "Search" \}/,
    );
    expect(existsSync(SCREEN)).toBe(true);
  });

  it("the top bar reaches it, from the seat the bell will take back", () => {
    const bar = body(TOPBAR);
    expect(bar).toMatch(/router\.push\("\/search"\)/);
    expect(bar).toMatch(/<DestinationIcon href="\/search"/);
    // And Discover is still on the other flank.
    expect(bar).toMatch(/router\.push\("\/discover"\)/);
  });

  it("a result opens the thing it is", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/pathname: "\/u\/\[username\]"/);
    expect(src).toMatch(/pathname: "\/post\/\[id\]\/comments"/);
    expect(src).toMatch(/params: \{ id: post\.id, owner: post\.user_id \}/);
  });

  it("a person with no username is not tappable", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/disabled=\{!p\.username\}/);
  });

  it("and there is a back control as well as the system gesture", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/accessibilityLabel="Back"/);
    expect(src).toMatch(/router\.back\(\)/);
  });
});

describe("what is not ported, and why", () => {
  it("recent searches are left out rather than shown broken", () => {
    /*
     * They live behind the key-value store, and this app installs none —
     * a synchronous Kv on a phone wants MMKV, a native module. The row
     * would be empty every time, which looks broken rather than new.
     */
    /*
     * Checked over the WHOLE source, imports included: `body` strips
     * imports, so an import-only mutation survived this (S37). That is
     * the comment trap once more, with an import standing in again.
     */
    expect(code(LOAD), "recent searches were wired to a store that is not there").not.toMatch(
      /loadRecentSearches|rememberSearch/,
    );
    expect(read(LOAD)).toMatch(/Recent searches/);
  });

  it("Shots are not asked for, because nothing renders one", () => {
    const src = body(LOAD);
    expect(src, "Shots are searched but cannot be shown").not.toMatch(/search_shots/);
    expect(code(WEB), "the web no longer searches Shots").toMatch(/search_shots/);
    expect(read(LOAD)).toMatch(/Shots/);
  });

  it("and the rest is written down where someone will read it", () => {
    const src = read(LOAD);
    for (const absent of ["Suggestions", "Tags as results"]) {
      expect(src, `${absent} is no longer recorded as absent`).toContain(absent);
    }
  });
});
