/**
 * Reading a Supabase result without throwing the error away.
 *
 * **Why this exists, written down because it cost a shipped screen.**
 *
 * Every loader on the phone was written as `const { data } = await
 * supabase.from(...)` — the error destructured away unread. On 19 Nov that
 * turned a wrong column name into an empty feed with no message: the
 * `posts` table has `image_url` and `image_urls`, the loaders asked for
 * `media_url` and `media_urls`, PostgREST refused the select, `data` came
 * back null, and the screen rendered its "Nothing here yet" state. It
 * looked like an account with no posts.
 *
 * The tests could not catch it either. They asserted the column names
 * appeared in the loader's own constant — which they did. Nothing compared
 * them against the schema, and nothing noticed the error being dropped.
 *
 * So: every read goes through `rows` or `row`, both of which throw. The
 * screens already catch and show the message verbatim, which is what turns
 * a silent empty state into "column posts.media_url does not exist".
 */

export type Result<T> = { data: T; error: unknown };

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
