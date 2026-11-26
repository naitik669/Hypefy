import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { POST_COLUMNS } from "../apps/mobile/src/feed/load";
import { COMMENT_COLUMNS } from "../apps/mobile/src/comments/load";
import { PROFILE_COLUMNS } from "../apps/mobile/src/profile/load";
import { GRID_COLUMNS } from "../apps/mobile/src/profile/posts";
import { DISCOVER_POST_COLUMNS } from "../apps/mobile/src/discover/load";
import { SEARCH_POST_COLUMNS } from "../apps/mobile/src/search/load";
import { SHOT_COLUMNS } from "../apps/mobile/src/shots/load";
import { MESSAGE_COLUMNS } from "../apps/mobile/src/messages/load";
import {
  NOTIF_COLUMNS,
  POST_THUMB_COLUMNS,
  SHOT_THUMB_COLUMNS,
  SHOW_THUMB_COLUMNS,
  COMMENT_PARENT_COLUMNS,
} from "../apps/mobile/src/notifications/load";

/**
 * Every column the phone asks for exists.
 *
 * **This test exists because a shipped screen was blank and nothing
 * noticed.** On 19 Nov the `posts` table's picture columns were read as
 * `media_url` and `media_urls`; they are `image_url` and `image_urls`.
 * PostgREST refused the select, `data` came back null, the loader
 * destructured the error away unread, and the feed rendered its "Nothing
 * here yet" state. It looked exactly like an account with no posts.
 *
 * Four layers of checking had let it through:
 *
 *  - **tsc** — the column list is a string.
 *  - **The parity tests** — they asserted the names appeared in the
 *    loader's own constant, which they did. Nothing compared them with
 *    the schema.
 *  - **Mutation testing** — it proves a test notices a change, not that
 *    what the test asserts is true of the world.
 *  - **`expo export`** — it bundles; it does not run a query.
 *
 * So this one compares every select against the generated database types,
 * which are the schema. It is the cheapest check in the suite and the only
 * one that could have caught it.
 */

const TYPES = "packages/core/src/supabase/database.types.ts";

/**
 * The column names of one table, from the generated types.
 *
 * Read out of `Row: { … }`, which is what a select returns. Insert and
 * Update have different optionality and would be the wrong answer.
 */
function columnsOf(table: string): Set<string> {
  const src = readFileSync(TYPES, "utf8");
  const at = src.indexOf(`      ${table}: {`);
  expect(at, `${table} is not in the generated types`).toBeGreaterThan(-1);
  const rowAt = src.indexOf("Row: {", at);
  const insertAt = src.indexOf("Insert:", at);
  expect(rowAt, `${table} has no Row type`).toBeGreaterThan(-1);
  expect(insertAt).toBeGreaterThan(rowAt);
  const block = src.slice(rowAt, insertAt);
  return new Set([...block.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]));
}

/**
 * The plain column names in a PostgREST select, ignoring embeds.
 *
 * An embedded join — `profiles!posts_user_id_fkey(id, display_name)` — is
 * a relationship, not a column of this table, so its contents are skipped
 * and the relationship itself is checked separately below.
 */
function selected(select: string): string[] {
  const withoutEmbeds = select.replace(/[\w!]+\([^)]*\)/g, "");
  return withoutEmbeds
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^\w+$/.test(s));
}

const SELECTS: ReadonlyArray<readonly [string, string, string]> = [
  ["the feed", "posts", POST_COLUMNS],
  ["the profile grid", "posts", GRID_COLUMNS],
  ["discover", "posts", DISCOVER_POST_COLUMNS],
  ["comments", "comments", COMMENT_COLUMNS],
  ["a profile", "profiles", PROFILE_COLUMNS],
  ["search", "posts", SEARCH_POST_COLUMNS],
  ["the reel", "shots", SHOT_COLUMNS],
  ["a thread", "messages", MESSAGE_COLUMNS],
  ["activity", "notifications", NOTIF_COLUMNS],
  // Activity's four thumbnail reads, each naming a different table's
  // picture column — which is precisely the mix-up this file exists for.
  ["an activity row's post", "posts", POST_THUMB_COLUMNS],
  ["an activity row's Shot", "shots", SHOT_THUMB_COLUMNS],
  ["an activity row's Show", "shows", SHOW_THUMB_COLUMNS],
  ["an activity row's comment", "comments", COMMENT_PARENT_COLUMNS],
];

describe("every column the phone selects exists in the schema", () => {
  for (const [what, table, select] of SELECTS) {
    it(`${what} reads only real columns of ${table}`, () => {
      const real = columnsOf(table);
      const asked = selected(select);
      expect(asked.length, `${what} selects nothing`).toBeGreaterThan(0);
      const missing = asked.filter((c) => !real.has(c));
      expect(missing, `${what} asks ${table} for columns it does not have`).toEqual([]);
    });
  }

  it("and the test can tell a wrong column from a right one", () => {
    /*
     * The check above is only worth having if it would have failed on the
     * actual defect. This asserts that directly: the names that were
     * shipped are not columns of `posts`, and the ones that replaced them
     * are.
     */
    const posts = columnsOf("posts");
    expect(posts.has("media_url"), "posts.media_url exists after all").toBe(false);
    expect(posts.has("media_urls")).toBe(false);
    expect(posts.has("image_url"), "posts.image_url is missing").toBe(true);
    expect(posts.has("image_urls")).toBe(true);
    // And `shots` really does use media_url, which is why the mix-up was
    // easy to make in the first place.
    expect(columnsOf("shots").has("media_url")).toBe(true);
  });

  it("the embedded profile join names a real constraint", () => {
    /*
     * `posts` has more than one foreign key to `profiles`, so the join has
     * to be named — and a wrong name fails the same silent way a wrong
     * column does.
     */
    const src = readFileSync(TYPES, "utf8");
    for (const select of [POST_COLUMNS, DISCOVER_POST_COLUMNS, SEARCH_POST_COLUMNS]) {
      const m = select.match(/profiles!(\w+)\(/);
      expect(m, "the posts select no longer names its profile join").toBeTruthy();
      expect(
        src.includes(`foreignKeyName: "${m?.[1]}"`),
        `${m?.[1]} is not a foreign key in the generated types`,
      ).toBe(true);
    }
  });
});

describe("a failed read is never mistaken for an empty one", () => {
  /*
   * The deeper defect. The columns were wrong, but what made it invisible
   * was `const { data } = await …` — the error destructured away unread,
   * so a refused query and an empty table were the same thing.
   */
  const LOADERS = [
    "apps/mobile/src/feed/load.ts",
    "apps/mobile/src/comments/load.ts",
    "apps/mobile/src/profile/load.ts",
    "apps/mobile/src/profile/posts.ts",
    "apps/mobile/src/discover/load.ts",
    "apps/mobile/src/search/load.ts",
    "apps/mobile/src/shots/load.ts",
    "apps/mobile/src/messages/load.ts",
    "apps/mobile/src/notifications/load.ts",
  ];

  function body(path: string): string {
    return readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  for (const path of LOADERS) {
    it(`${path} does not throw its errors away`, () => {
      const src = body(path);
      /*
       * `const { data } = await` is the shape that hid it: destructuring
       * `data` alone, with no `error` beside it. Every read goes through
       * @/query instead, which throws with Postgres's own message.
       */
      expect(src, "a read destructures data and drops the error").not.toMatch(
        /const \{ data \} = await/,
      );
      expect(src, "a read destructures data with a rename and drops the error").not.toMatch(
        /const \{ data: \w+ \} = await/,
      );
    });
  }

  it("and the screens show that message rather than an empty state", () => {
    // The guard is only useful if the thrown message reaches a person.
    for (const screen of [
      "apps/mobile/app/(tabs)/home.tsx",
      "apps/mobile/app/post/[id]/comments.tsx",
      "apps/mobile/app/u/[username].tsx",
    ]) {
      const src = body(screen);
      expect(src, `${screen} does not show the error it caught`).toMatch(/\{error\}/);
    }
  });

  it("the helper names which read failed", () => {
    /*
     * Eight queries run in parallel on Discover. "column does not exist"
     * on its own does not say where to look, which is most of the cost of
     * diagnosing one.
     */
    /*
     * Every reader, not whichever one a given suite happens to hit:
     * mutation S41 took the name out of `rows` while `row` and `count`
     * kept it, and a single match stayed green.
     *
     * The helper moved to packages/core when the WEBSITE hit the same
     * defect in November — a refused query and an empty table being one
     * value — so both clients now read through it. Counting named throws
     * against total throws rather than against the literal 3 means adding
     * a reader cannot quietly add an unnamed one.
     */
    const src = body("packages/core/src/query.ts");
    const throws = [...src.matchAll(/throw new Error\(/g)].length;
    const named = [...src.matchAll(/throw new Error\(`\$\{what\}: /g)].length;
    expect(throws, "no reader throws at all").toBeGreaterThanOrEqual(3);
    expect(named, "a reader throws without saying which query failed").toBe(throws);
    // The optional read is the one most likely to go quiet again, so it
    // has to name the query too.
    expect(src, "tolerate swallows the message it exists to surface").toMatch(
      /console[.]error\(`\[query\] optional read failed/,
    );
    // And the phone still reaches it, or this file is checking nothing the
    // phone uses.
    expect(body("apps/mobile/src/query.ts")).toMatch(/@hypefy\/core\/query/);
    // A count is a read too, and a zero reads as "no followers".
    expect(src).toMatch(/export function count/);
  });
});
