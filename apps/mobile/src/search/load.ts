import { searchScope, searchFailed, type SearchScope } from "@hypefy/core/search-run";
import { rows } from "../query";

/**
 * Searching, as the website searches.
 *
 * The RPCs do the work — `search_people` and `search_posts` are ranked
 * full-text functions, not `ilike '%term%'`. The web's own note on why
 * that matters is worth keeping: the old query had no notion of a better
 * match, so the top result for any live topic was the oldest popular post
 * about it, and the term was interpolated into PostgREST's `or=` filter
 * where a comma is syntax — so searching "hey, you" did not return poor
 * results, it returned wrong ones.
 *
 * `searchScope` from @hypefy/core decides what to ask for. The prefixes
 * are not cosmetic: `@maya` means people only, `#art` means everything
 * except people, and `@` returning posts would put a stranger's
 * photograph above the person being looked for.
 *
 * **What the web's page has and this does not:**
 *
 *  - **Shots.** Not rendered anywhere yet, so not asked for.
 *  - **Suggestions** when the results are thin (`search_suggestions`).
 *  - **Tags as results**, which the web carves out of the post rows.
 *  - **Recent searches.** They live behind the key-value store, and this
 *    app installs none — a synchronous Kv on a phone wants MMKV, a native
 *    module. `loadRecentSearches` would return nothing every time, so the
 *    row would look broken rather than empty. Left out until there is a
 *    store to put them in.
 */

export const PEOPLE_LIMIT = 20;
export const POST_LIMIT = 24;

/** The columns a result row renders. */
export const SEARCH_POST_COLUMNS =
  "id, caption, image_url, image_urls, created_at, user_id, hype_count, comment_count, " +
  "profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, is_verified)";

export type SearchProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type SearchPost = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  created_at: string;
  user_id: string;
  hype_count: number | null;
  comment_count: number | null;
  profiles: SearchProfile | null;
};

export type SearchResults = {
  scope: SearchScope;
  people: SearchProfile[];
  posts: SearchPost[];
  /** Every part that was asked for came back an error. */
  failed: boolean;
};

type Answer = { data: unknown; error: unknown };

type Queryable = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<Answer> & { select(columns: string): PromiseLike<Answer> };
};

function one<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return (raw as T) ?? null;
}

export function normaliseSearchPost(raw: Record<string, unknown>): SearchPost {
  return {
    ...(raw as unknown as SearchPost),
    profiles: one<SearchProfile>(raw.profiles),
  };
}

/** Nothing asked, nothing answered — an empty query is not a failed one. */
export const NO_RESULTS: SearchResults = {
  scope: searchScope(""),
  people: [],
  posts: [],
  failed: false,
};

export async function search(supabase: Queryable, query: string): Promise<SearchResults> {
  const scope = searchScope(query);
  if (!scope.term) return NO_RESULTS;

  /*
   * Asked together, not one after another: they do not depend on each
   * other, and waiting for people before asking for posts doubled the
   * wait. The web says the same.
   */
  const skipped: Answer = { data: [], error: null };
  const [peopleRes, postsRes] = await Promise.all([
    scope.people
      ? supabase.rpc("search_people", { p_q: scope.term, p_limit: PEOPLE_LIMIT })
      : skipped,
    scope.posts
      ? supabase.rpc("search_posts", { p_q: scope.term, p_limit: POST_LIMIT }).select(
          SEARCH_POST_COLUMNS,
        )
      : skipped,
  ]);

  /*
   * A part that was never asked for says nothing either way, which is why
   * only the asked ones decide. The distinction this protects is the
   * point: "nothing matched" sends someone away believing their friend is
   * not on Hypefy; "search is not working" sends them back in a minute.
   */
  const asked = [scope.people ? peopleRes : null, scope.posts ? postsRes : null].filter(
    (r): r is Answer => r !== null,
  );
  const failed = searchFailed(asked);

  // On a total failure the rows are not read at all — `rows` would throw,
  // and the screen has a better thing to say than a Postgres message.
  if (failed) return { scope, people: [], posts: [], failed: true };

  /*
   * A PART that failed contributes nothing, and the other part is still
   * shown. The web does the same, and the reason is worth stating: if
   * people errors and posts does not, throwing loses the posts as well —
   * so one broken half takes down a search that half worked.
   *
   * `rows` is called only on the parts that did not error, which is what
   * keeps its throw meaningful everywhere else. A test that drove one
   * part to an error found this; the source-reading version could not.
   */
  const ok = (answer: Answer) => !answer.error;

  return {
    scope,
    people:
      scope.people && ok(peopleRes) ? rows<SearchProfile>(peopleRes, "search people") : [],
    posts:
      scope.posts && ok(postsRes)
        ? rows<Record<string, unknown>>(postsRes, "search posts").map(normaliseSearchPost)
        : [],
    failed: false,
  };
}
