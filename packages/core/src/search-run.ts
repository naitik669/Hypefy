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
