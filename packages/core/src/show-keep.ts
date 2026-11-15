import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keeping a Show past its day.
 *
 * This used to be a boolean on the row, `is_showcase`. 0068 replaced
 * the idea with Showcase boards — named, ordered, several of them — and
 * said in its own comments that the old column was left in place
 * deliberately. It then stayed, read by four code paths, meaning
 * something a little different from the thing that replaced it: a
 * flagged Show was kept but was on no board, so it survived expiry and
 * appeared nowhere.
 *
 * Keeping one now means putting it on a board, which is the same thing
 * the reaper and can_see_show already ask about. The board is "Kept",
 * the word the UI used for these, made on first use — somebody opening
 * it should recognise what they are looking at rather than find a
 * title the code invented.
 */

/** The board a Show goes to when it is kept with no board named. */
export const KEPT_BOARD = "Kept";

// The generated Database type is not threaded through these helpers;
// they are called from components that hold a typed client and from
// tests that hold a stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/**
 * The id of this person's Kept board, making it if there is none.
 *
 * Returns null rather than throwing: keeping a Show is a convenience,
 * and a failure here has to read as "it did not work" at the call site
 * rather than take the viewer down mid-story.
 */
export async function keptBoardId(supabase: Client, userId: string): Promise<string | null> {
  const { data: found } = await supabase
    .from("showcases")
    .select("id")
    .eq("user_id", userId)
    .eq("title", KEPT_BOARD)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();

  if (found?.id) return found.id as string;

  const { data: made } = await supabase
    .from("showcases")
    .insert({ user_id: userId, title: KEPT_BOARD })
    .select("id")
    .single();

  return (made?.id as string | undefined) ?? null;
}

/**
 * Put a Show on the Kept board.
 *
 * A 'show' item carries the id alone — showcase_items_source requires
 * media_url and caption to be null for this kind, because the board
 * reads them through the join rather than copying them.
 */
export async function keepShow(
  supabase: Client,
  userId: string,
  showId: string,
): Promise<boolean> {
  const board = await keptBoardId(supabase, userId);
  if (!board) return false;

  // Keeping one that is already kept is not an error, and must not
  // leave a second copy on the board.
  const { data: already } = await supabase
    .from("showcase_items")
    .select("id")
    .eq("showcase_id", board)
    .eq("show_id", showId)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();

  if (already?.id) return true;

  const { data: last } = await supabase
    .from("showcase_items")
    .select("position")
    .eq("showcase_id", board)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("showcase_items").insert({
    showcase_id: board,
    kind: "show",
    show_id: showId,
    position: ((last?.position as number | undefined) ?? -1) + 1,
  });

  return !error;
}

/**
 * Take it back off.
 *
 * Off every board, not just the Kept one. The control says "kept" and
 * means "survives its day", and leaving it on some other board would
 * make unkeeping it a lie — it would still be there tomorrow.
 */
export async function unkeepShow(supabase: Client, showId: string): Promise<boolean> {
  const { error } = await supabase
    .from("showcase_items")
    .delete()
    .eq("show_id", showId);

  return !error;
}
