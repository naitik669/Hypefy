import type { SupabaseClient } from "@supabase/supabase-js";
import { rows } from "./query";

/**
 * Which options of a poll are ticked for the person looking at it.
 *
 * The tally travels with the message, but whose choices are whose cannot:
 * the message is the same row for everybody. So this is the one read a poll
 * makes of the votes table, kept apart from chat-poll.ts because that file
 * does no fetching.
 *
 * Filtered by user as well as by message, and the user filter is not
 * optional: RLS lets every member read every member's votes (0174, on
 * purpose), so without it the read returns the whole conversation's choices
 * and every one of them would be ticked as yours. That shipped once.
 *
 * Read through `rows`, so a refused query throws instead of looking like a
 * poll you have not voted on — which would also make your next press of
 * your own option take the vote back while ticking it.
 */

type Db = Pick<SupabaseClient, "from">;

export async function readMyChoices(
  supabase: Db,
  messageId: string,
  userId: string,
): Promise<Set<number>> {
  const mine = rows<{ choice: number }>(
    await supabase
      .from("message_poll_votes")
      .select("choice")
      .eq("message_id", messageId)
      .eq("user_id", userId),
    "your poll votes",
  );
  return new Set(mine.map((r) => r.choice));
}
