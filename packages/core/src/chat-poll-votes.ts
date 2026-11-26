import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which options of a poll are ticked for the person looking at it.
 *
 * The tally travels with the message, but whose choices are whose cannot:
 * the message is the same row for everybody. So this is the one read a poll
 * makes of the votes table, kept apart from chat-poll.ts because that file
 * does no fetching.
 */

type Db = Pick<SupabaseClient, "from">;

export async function readMyChoices(supabase: Db, messageId: string): Promise<Set<number>> {
  const { data } = await supabase
    .from("message_poll_votes")
    .select("choice")
    .eq("message_id", messageId);
  return new Set((data ?? []).map((r: { choice: number }) => r.choice));
}
