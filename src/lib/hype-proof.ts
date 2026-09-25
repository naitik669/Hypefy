import { createClient } from "@/lib/supabase/client";

/**
 * Who, of the people you follow, hyped a thing.
 *
 * A number says how popular something is. A face says someone you know
 * thought it was worth it, which is the thing people actually open a feed to
 * find out. The data was already stored and never read.
 *
 * This is for posts and shots only. Spotlight pages count in `note_hypes` and
 * promise no viewer list and no public count; they are drawn by a different
 * component on purpose, so that promise is structural rather than remembered.
 */

export type Previewer = {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  hue: number | null;
};

export type HypeProof = {
  previewers: Previewer[];
  /** How many people the viewer follows hyped this. */
  friendCount: number;
};

export type HypeTarget = "post" | "shot";

/**
 * One call for a whole page of cards.
 *
 * Per-card would be ten round trips a screen, which is the one way this turns
 * into a performance problem. Callers fetch once per feed page and hand each
 * card its own answer.
 */
export async function fetchHypeProof(
  targetType: HypeTarget,
  targetIds: string[],
): Promise<Map<string, HypeProof>> {
  const out = new Map<string, HypeProof>();
  const ids = [...new Set(targetIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data, error } = await createClient().rpc("hype_proof", {
    p_target_type: targetType,
    p_target_ids: ids,
  });
  // Proof is a garnish. If it cannot be fetched the cards still work, so this
  // never surfaces an error — it just goes back to being a number.
  if (error || !Array.isArray(data)) return out;

  for (const row of data as {
    target_id: string;
    previewers: Previewer[] | null;
    friend_count: number | null;
  }[]) {
    const previewers = Array.isArray(row.previewers) ? row.previewers : [];
    if (previewers.length === 0) continue;
    out.set(row.target_id, {
      previewers,
      friendCount: row.friend_count ?? previewers.length,
    });
  }
  return out;
}

/** A name to put in the line, never an empty string. */
function label(p: Previewer): string {
  return p.name?.trim() || p.username || "Someone";
}

/**
 * What the line says.
 *
 * The counting is the feature — get it wrong and it reads like a machine
 * talking. "Others" means everyone else who hyped it, not just the rest of
 * your friends, so the sentence stays true whether the post has eleven hypes
 * or eleven hundred.
 *
 *   one friend, alone        Aman hyped this
 *   two friends, alone       Aman and Craziematez hyped this
 *   one friend, big post     Aman & 1,203 others hyped this
 *   more                     Aman, Craziematez & 1,202 others hyped this
 *
 * Nobody you follow gets no line at all — the count in the action row already
 * said that, and "1,204 people you don't know hyped this" helps no one.
 *
 * It never names the viewer. The star beside the count is already filled and
 * gold once you have hyped something, so "You, Aman & 5 others" spends one of
 * only two name slots restating what the star said. You are still in the
 * total, and you still lead the Hyped-by list.
 */
export function proofSentence(
  previewers: Previewer[],
  total: number,
): { names: string[]; joiner: string; tail: string } | null {
  if (previewers.length === 0) return null;

  const names = previewers.slice(0, 2).map(label);
  const rest = Math.max(0, total - names.length);

  // Two people is a sentence, so they get "and". Once there is a remainder it
  // is a list, and a list takes a comma and an ampersand.
  if (rest === 0) return { names, joiner: " and ", tail: " hyped this" };
  return {
    names,
    joiner: ", ",
    tail: ` & ${rest.toLocaleString()} other${rest === 1 ? "" : "s"} hyped this`,
  };
}

/**
 * The people you and someone else both follow.
 *
 * Shown on their profile, and on a chat neither of you has ever written in —
 * a profile is where you are curious, an empty chat is where you are stuck.
 * Follows only: shared taste from someone you have never spoken to reads as
 * being studied.
 */
export type SharedFollows = { count: number; names: string[] };

export async function fetchSharedFollows(otherId: string): Promise<SharedFollows | null> {
  if (!otherId) return null;
  const { data, error } = await createClient().rpc("shared_follows", { p_other: otherId });
  if (error || !data || typeof data !== "object") return null;
  const row = data as { count?: number; names?: unknown };
  const count = typeof row.count === "number" ? row.count : 0;
  const names = Array.isArray(row.names) ? row.names.filter((n): n is string => typeof n === "string") : [];
  return { count, names };
}

/**
 * Under three, say nothing.
 *
 * "1 of the same people" is worse than an empty space: it invites the reader
 * to notice how little there is.
 */
export const SHARED_FOLLOWS_FLOOR = 3;

/** "Riya, Dev, Ishaan and 2 more", or just the count when no names came back. */
export function sharedFollowsNames(s: SharedFollows): string | null {
  if (s.names.length === 0) return null;
  const more = s.count - s.names.length;
  const listed = s.names.join(", ");
  return more > 0 ? `${listed} and ${more} more` : listed;
}
