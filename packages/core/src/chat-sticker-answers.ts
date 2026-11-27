import type { SupabaseClient } from "@supabase/supabase-js";
import { rows } from "./query";

/**
 * The reads an interactive sticker in a conversation makes (0221).
 *
 * Kept apart from chat-stickers.ts, which does no fetching — the same split
 * chat-poll.ts and chat-poll-votes.ts make.
 *
 * Filtered by user as well as by message. Since 0221 RLS only returns your
 * own rows anyway, but the filter is what makes that true here rather than
 * true because of a policy somebody may widen again: the poll tick bug of
 * 26 Nov was exactly this read without the filter.
 */

type Db = Pick<SupabaseClient, "from" | "rpc">;

/** The database does not have the function (yet): Postgres's 42883, PostgREST's PGRST202. */
export function isMissingFunction(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42883" || code === "PGRST202";
}

/** Your slider value or your answer to a question, or null if you have not given one. */
export async function readMyStickerAnswer(
  supabase: Db,
  messageId: string,
  userId: string,
): Promise<{ value: number | null; body: string | null } | null> {
  const mine = rows<{ value: number | null; body: string | null }>(
    await supabase
      .from("message_sticker_answers")
      .select("value, body")
      .eq("message_id", messageId)
      .eq("user_id", userId),
    "your answer",
  );
  return mine[0] ?? null;
}

/** One person's answer, as the asker's results sheet draws it. */
export type StickerResult = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  hue: number;
  choices: number[];
  value: number | null;
  body: string | null;
};

/**
 * Who answered what — for the person who asked. Anyone else gets an empty
 * list from the server (dm_sticker_results), which is the rule, not an error.
 * A refused call throws: an empty sheet would say nobody answered.
 *
 * "unavailable" when the function is not there at all, which is the state
 * of the live database between this code deploying and 0221 being run in
 * the SQL editor. The counts are on the card already; the sheet says the
 * names come with the next database update rather than failing.
 */
export async function readStickerResults(supabase: Db, messageId: string): Promise<StickerResult[] | "unavailable"> {
  const res = await supabase.rpc("dm_sticker_results", { p_message_id: messageId });
  if (isMissingFunction(res.error)) return "unavailable";
  const got = rows<{
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    avatar_hue: number | null;
    choices: number[] | null;
    value: number | null;
    body: string | null;
  }>(res, "who answered");
  return got.map((r) => ({
    userId: r.user_id,
    name: r.display_name?.trim() || r.username || "Someone",
    username: r.username,
    avatarUrl: r.avatar_url,
    hue: r.avatar_hue ?? 0,
    choices: r.choices ?? [],
    value: r.value,
    body: r.body,
  }));
}
