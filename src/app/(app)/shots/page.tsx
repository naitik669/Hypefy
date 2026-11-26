import { Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReelsFeed, type Reel } from "@/components/shots/ReelsFeed";
import { diversify } from "@/lib/feed-rank";
import { placeGhost } from "@/lib/ghost-place";
import { getFeedExclusions, isQuieted, NO_EXCLUSIONS } from "@/lib/feed-quiet";
import { one, jsonRecord } from "@/lib/supabase/typed";
import { getAdContext } from "@/lib/ads-server";
import { rows, tolerate } from "@hypefy/core/query";

/** What a Shot in the feed is made of. One list, so every Shot in it has the same fields. */
const SHOT_COLS =
  "id, user_id, media_url, poster_url, caption, created_at, hype_count, comment_count, save_count, repost_count, duration_secs, trim_start, trim_end, track, profiles!shots_user_id_fkey(display_name, avatar_hue, avatar_url, username)";

/**
 * How far a Shot you have already watched drops.
 *
 * Enough to put it behind anything comparable you have not seen, not
 * enough to hide it: with a small catalogue the alternative to a watched
 * Shot is often no Shot, and an empty reel is worse than a repeat.
 */
export const WATCHED_PENALTY = 30;

/** Personalized Shot score: engagement (capped) + tiered recency + author affinity. */
function shotScore(
  s: any,
  now: number,
  authorAff: Record<string, number>,
  watched = false,
) {
  const h = (now - new Date(s.created_at).getTime()) / 3_600_000;
  const recency = h < 2 ? 24 : h < 24 ? 14 : h < 72 ? 6 : 0;
  const engagement = Math.min(
    (s.hype_count ?? 0) * 3 + (s.comment_count ?? 0) * 2 + (s.save_count ?? 0) * 2,
    60,
  );
  const authorBoost = Math.min(Math.max(authorAff[s.user_id] ?? 0, 0) * 1.5, 30);
  // shot_views has recorded what you have watched since 0132 and this feed
  // never read it, so the reel re-served the same Shots indefinitely.
  return recency + engagement + authorBoost - (watched ? WATCHED_PENALTY : 0);
}

/**
 * A rehype from someone you follow is a signal worth a little lift: it is a
 * person you chose telling you this one is good. Ranked by when they rehyped
 * it, not when it was posted, so an older Shot can resurface — that is the
 * point of rehyping it.
 */
const REHYPE_BOOST = 8;

type RehypeRow = { rehyped_at: string; rehyper_id: string; rehyper_name: string | null; shot: unknown };

/** A Shot as the feed ranks it: the row, plus how it got here. */
type FeedShot = Record<string, unknown> & {
  id: string;
  user_id: string;
  created_at: string;
  profiles: unknown;
  _rehypedById?: string;
  _rehypedAt?: string;
};

export default async function ShotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Candidate window + interaction affinity, ranked into a personalized reel.
  const [shotsRes, affRes, adContext, rehypesRes, ghostRes, quiet] = await Promise.all([
    supabase
      .from("shots")
      .select(SHOT_COLS)
      // Never a removed Shot, even to the one person who can still read it.
      // The select policy allows `removed_at is null OR user_id = auth.uid()
      // OR is_admin()`, which is right for an author's own archive and wrong
      // for a feed: a Shot taken down by a moderator was still served into
      // its author's reel, and every removed Shot on Hypefy into an admin's.
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
    user ? supabase.rpc("get_affinity", { p_lookback_days: 60 }) : Promise.resolve({ data: null, error: null }),
    // In parallel with the reel, not after it: the date-of-birth lookup is
    // one more round trip, and it should not add to the time to first frame.
    getAdContext(supabase, user?.id),
    // Shots the people you follow rehyped. One call, in parallel — fetching
    // the follow list first would put a round trip before the first frame.
    user
      ? supabase.rpc("followed_shot_rehypes", { p_limit: 20 })
      : Promise.resolve({ data: null, error: null }),
    // A Shot that someone this person follows, and is followed by, chose for
    // them (Ghost Share, 0119). At most one, and only its id: who chose it is
    // not something this page is ever told. See src/lib/ghost-place.ts.
    user ? supabase.rpc("claim_ghost_share", { p_kind: "shot" }) : Promise.resolve({ data: null, error: null }),
    // People this person muted, and Shots they chose not to see again.
    user ? getFeedExclusions(supabase) : Promise.resolve(NO_EXCLUSIONS),
  ]);
  /*
   * The reel itself throws. A reel that cannot be read is not an empty
   * reel, and saying "The reel is empty" when PostgREST refused the query
   * is what hid a twelve-day outage: the route error boundary says "That
   * didnt load" and offers a retry, which is the truth.
   */
  const shots = rows<FeedShot>(shotsRes, "the Shots reel");

  /*
   * Everything below is enrichment — who you watch, what your friends
   * rehyped, a Ghost Share. A reel ranked a little worse beats no reel, so
   * these degrade. They do NOT degrade quietly: tolerate puts the database
   * message in the server log.
   */
  const ghostId = (tolerate(ghostRes, "a Ghost Share") as string | null) ?? null;

  const authorAff = jsonRecord((tolerate(affRes, "affinity scores") as { authors?: Parameters<typeof jsonRecord>[0] } | null)?.authors);
  const now = Date.now();

  // One entry per Shot: a rehyped Shot already in the window keeps its row
  // and gains the label, rather than appearing twice.
  const byId = new Map<string, FeedShot>();
  for (const s of shots) byId.set(s.id, { ...s, profiles: one(s.profiles as never) });
  for (const r of ((tolerate(rehypesRes, "rehypes from people you follow") ?? []) as RehypeRow[])) {
    const shot = r.shot as FeedShot | null;
    if (!shot?.id) continue;
    byId.set(shot.id, {
      ...(byId.get(shot.id) ?? shot),
      _rehypedById: r.rehyper_id,
      _rehypedAt: r.rehyped_at,
    });
  }

  // Outside the newest eighty: fetched, and put in with the rest so that it
  // is scored and shaped exactly as they are.
  if (ghostId && !byId.has(ghostId)) {
    const placed = tolerate(
      await supabase.from("shots").select(SHOT_COLS).eq("id", ghostId).maybeSingle(),
      "the Ghost Shared Shot",
    );
    if (placed) {
      const row = placed as unknown as FeedShot;
      byId.set(row.id, { ...row, profiles: one(row.profiles as never) });
    }
  }

  // What you have already watched, for the penalty above.
  const candidateShotIds = [...byId.keys()];
  const watchedRows =
    user && candidateShotIds.length > 0
      ? tolerate(
          await supabase
            .from("shot_views")
            .select("shot_id")
            .eq("viewer_id", user.id)
            .in("shot_id", candidateShotIds),
          "which Shots you have already watched",
        ) ?? []
      : [];
  const watched = new Set(watchedRows.map((v) => v.shot_id));

  const ranked = diversify(
    [...byId.values()]
      .filter((s) => !isQuieted(s, "shot", quiet))
      .map((s) => {
        const seen = watched.has(s.id);
        const own = shotScore(s, now, authorAff, seen);
        const viaRehype = s._rehypedAt
          ? shotScore({ ...s, created_at: s._rehypedAt }, now, authorAff, seen) + REHYPE_BOOST
          : -Infinity;
        return { ...s, _score: Math.max(own, viaRehype) };
      })
      .sort((a, b) =>
        b._score !== a._score ? b._score - a._score : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
  );

  const reels = placeGhost(ranked, ghostId ? ranked.find((s) => s.id === ghostId) : null);

  if (reels.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="The reel is empty"
        text="Short videos, big energy. Fire the first Shot."
        ctaLabel="Add Shot"
        ctaHref="/create?mode=shot"
      />
    );
  }

  return (
    // The rows carry exactly the columns selected above (and the RPC builds
    // the same shape), which is what a Reel is.
    <ReelsFeed reels={reels as unknown as Reel[]} currentUserId={user?.id ?? null} remember {...adContext} />
  );
}
