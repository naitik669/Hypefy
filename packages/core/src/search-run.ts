/**
 * Two small things the search page needs to get right.
 */

/**
 * Only the newest of several overlapping requests may speak.
 *
 * Search asks the server as you type. Answers do not come back in the order
 * the questions went out: "ab" can arrive after "abc". Without this, the
 * late answer to the older question replaced the results for what was
 * actually in the box.
 *
 *   const id = runs.begin();
 *   const data = await ask();
 *   if (!runs.isCurrent(id)) return;   // something newer has been asked
 */
export function latestOnly() {
  let newest = 0;
  return {
    begin(): number {
      newest += 1;
      return newest;
    },
    isCurrent(id: number): boolean {
      return id === newest;
    },
    /** Whatever is in flight no longer matters: the box was cleared. */
    cancel() {
      newest += 1;
    },
  };
}

/**
 * Where recent searches are kept, per account.
 *
 * It was one list for the whole device, so on a phone with two accounts each
 * saw what the other had been looking for.
 */
export const LEGACY_RECENT_KEY = "hypefy_recent_searches";
export function recentSearchKey(userId: string): string {
  return `${LEGACY_RECENT_KEY}:${userId}`;
}

/**
 * What a query asks for.
 *
 * The two prefixes are the whole rule, and they are not cosmetic: `@maya`
 * means people only, `#art` means everything except people. Getting them
 * wrong is not a worse search, it is a different one — `@` returning posts
 * puts a stranger's photograph above the person being looked for.
 *
 * Here rather than in each client because the phone asks the same
 * questions, and two clients disagreeing about what `#` means would be
 * invisible until somebody compared them side by side.
 */
export type SearchScope = {
  /** The query with the prefix kept — the RPCs take it as typed. */
  readonly term: string;
  readonly people: boolean;
  readonly posts: boolean;
  readonly shots: boolean;
  /** Which prefix, if any, decided the above. */
  readonly kind: "tag" | "user" | "all";
};

export function searchScope(query: string): SearchScope {
  const term = query.trim();
  const isTag = term.startsWith("#");
  const isUser = term.startsWith("@");
  return {
    term,
    people: !isTag,
    posts: !isUser,
    shots: !isUser,
    kind: isTag ? "tag" : isUser ? "user" : "all",
  };
}

/**
 * Whether the SEARCH failed, as opposed to finding nothing.
 *
 * Every part that was asked for came back an error. The distinction is the
 * point: "nothing matched" sends someone away believing their friend is
 * not on Hypefy, where "search is not working" sends them back in a
 * minute. A part that was never asked for — posts under `@` — says
 * nothing either way, which is why this takes only the ones asked.
 */
export function searchFailed(asked: ReadonlyArray<{ error: unknown }>): boolean {
  return asked.length > 0 && asked.every((r) => Boolean(r.error));
}
