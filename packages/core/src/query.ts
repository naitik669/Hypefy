/**
 * Reading a Supabase result without throwing the error away.
 *
 * **Why this exists, written down because it has now cost two shipped
 * screens on two different clients.**
 *
 * The phone, 19 Nov: every loader was `const { data } = await
 * supabase.from(...)`, the error destructured away unread. The `posts` table
 * has `image_url` and `image_urls`; the loaders asked for `media_url` and
 * `media_urls`. PostgREST refused the select, `data` came back null, and the
 * screen rendered "Nothing here yet". It looked like an account with no
 * posts.
 *
 * The website, 14 to 26 Nov: a migration added `shot_watch_stats`, giving
 * PostgREST a second way to join `shots` to `profiles`, so it refused eight
 * queries with PGRST201. Written the same way, those reads produced the same
 * nothing. `/shots` said "The reel is empty" for twelve days with nine Shots
 * in the database, and the server logged 200 each time.
 *
 * The shape is identical and it is not a typo either time: a refused query
 * and an empty table are the SAME VALUE unless somebody reads the error.
 * Tests cannot close this — they compare a query against itself, and the
 * thing that broke was the database's opinion of it.
 *
 * So every read goes through one of these. `rows`, `row` and `count` throw,
 * because a page with no content and no explanation is a lie; the web's
 * route error boundary turns that into "That didn't load" with a retry, and
 * the phone's screens print the message verbatim. `tolerate` is for the
 * reads that genuinely are optional — the ad slot, the affinity scores —
 * where failing the whole page would be the worse answer, but failing in
 * silence is still not acceptable.
 */

function messageOf(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

/**
 * The rows, or an exception carrying Postgres's own words.
 *
 * `what` names the query so a message says which read failed — with eight
 * running in parallel, "column does not exist" on its own does not say
 * where to look.
 */
export function rows<T>(
  /*
   * `unknown` rather than `T[]`, for two reasons. The loaders type their
   * builders loosely — a PostgREST chain is not worth reproducing in full
   * — so the row shape is the caller's claim either way, and asking for
   * T[] would move the cast rather than add a check. And an RPC that
   * returns a set types its `data` as plain `unknown`, so a narrower
   * parameter simply refuses the callers that need this most.
   *
   * A non-array answer comes back as an empty list rather than throwing:
   * an RPC that returned one object where a set was expected is a shape
   * surprise, not a failed read, and the screen above has nothing useful
   * to say about it.
   */
  result: { data: unknown; error: unknown },
  what: string,
): T[] {
  if (result.error) throw new Error(`${what}: ${messageOf(result.error, "read failed")}`);
  return Array.isArray(result.data) ? (result.data as T[]) : [];
}

/** One row, or null when there genuinely is none. Throws on a real error. */
export function row<T>(
  result: { data: unknown; error: unknown },
  what: string,
): T | null {
  if (result.error) throw new Error(`${what}: ${messageOf(result.error, "read failed")}`);
  return (result.data ?? null) as T | null;
}

/**
 * A count, or an exception.
 *
 * Counts fail the same way a select does — a `head: true` request against a
 * missing column is still a refused request — and a zero where a number
 * should be reads as "no followers" rather than as a broken query.
 */
export function count(result: { count: number | null; error: unknown }, what: string): number {
  if (result.error) throw new Error(`${what}: ${messageOf(result.error, "count failed")}`);
  return result.count ?? 0;
}

/**
 * The data, or an exception carrying Postgres own words.
 *
 * Unlike `rows` and `row` this does not reshape anything: it hands back
 * exactly what the query inferred, so a call site converts by deleting the
 * destructure and nothing downstream changes type. That matters more than
 * elegance here — the migration touches long-standing loaders, and a helper
 * that forces every caller to restate its row type invites the casts and
 * `any`s that made the original failure invisible.
 */
export function must<T>(result: { data: T; error: unknown }, what: string): T {
  if (result.error) throw new Error(`${what}: ${messageOf(result.error, "read failed")}`);
  return result.data;
}

/**
 * A read the page can do without — but not quietly.
 *
 * Some reads are enrichment: the ad slot, the affinity scores, whether this
 * viewer already watched a Shot. Throwing would trade a slightly poorer page
 * for no page at all, which is the wrong way round. But the reason the two
 * outages above lasted days rather than minutes is that nothing anywhere
 * said a word, so "optional" must still mean LOUD: the message goes to the
 * server log, where Vercel keeps it and Sentry picks it up.
 *
 * It returns the query own value — usually null on failure — so the call
 * site keeps whatever fallback it already had, and the degraded case reads
 * the same as it always did.
 */
export function tolerate<T>(result: { data: T; error: unknown }, what: string): T {
  if (result.error) {
    console.error(`[query] optional read failed — ${what}: ${messageOf(result.error, "read failed")}`);
  }
  return result.data;
}
