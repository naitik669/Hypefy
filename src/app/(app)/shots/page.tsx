import { Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReelsFeed, type Reel } from "@/components/shots/ReelsFeed";
import { diversify } from "@/lib/feed-rank";
import { placeGhost } from "@/lib/ghost-place";
import { one, jsonRecord } from "@/lib/supabase/typed";
import { getAdContext } from "@/lib/ads-server";

/** What a Shot in the feed is made of. One list, so every Shot in it has the same fields. */
const SHOT_COLS =
  "id, user_id, media_url, poster_url, caption, created_at, hype_count, comment_count, save_count, repost_count, duration_secs, trim_start, trim_end, profiles(display_name, avatar_hue, avatar_url, username)";

/** Personalized Shot score: engagement (capped) + tiered recency + author affinity. */
function shotScore(s: any, now: number, authorAff: Record<string, number>) {
  const h = (now - new Date(s.created_at).getTime()) / 3_600_000;
  const recency = h < 2 ? 24 : h < 24 ? 14 : h < 72 ? 6 : 0;
  const engagement = Math.min(
    (s.hype_count ?? 0) * 3 + (s.comment_count ?? 0) * 2 + (s.save_count ?? 0) * 2,
    60,
  );
  const authorBoost = Math.min(Math.max(authorAff[s.user_id] ?? 0, 0) * 1.5, 30);
  return recency + engagement + authorBoost;
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
  const [{ data: shots }, affRes, adContext, rehypesRes, ghostRes] = await Promise.all([
    supabase
      .from("shots")
      .select(SHOT_COLS)
      .order("created_at", { ascending: false })
      .limit(80),
    user ? supabase.rpc("get_affinity", { p_lookback_days: 60 }) : Promise.resolve({ data: null }),
    // In parallel with the reel, not after it: the date-of-birth lookup is
    // one more round trip, and it should not add to the time to first frame.
    getAdContext(supabase, user?.id),
    // Shots the people you follow rehyped. One call, in parallel — fetching
    // the follow list first would put a round trip before the first frame.
    user
      ? supabase.rpc("followed_shot_rehypes", { p_limit: 20 })
      : Promise.resolve({ data: null }),
    // A Shot that someone this person follows, and is followed by, chose for
    // them (Ghost Share, 0119). At most one, and only its id: who chose it is
    // not something this page is ever told. See src/lib/ghost-place.ts.
    user ? supabase.rpc("claim_ghost_share", { p_kind: "shot" }) : Promise.resolve({ data: null }),
  ]);
  const ghostId = (ghostRes.data as string | null) ?? null;

  const authorAff = jsonRecord((affRes.data as any)?.authors);
  const now = Date.now();

  // One entry per Shot: a rehyped Shot already in the window keeps its row
  // and gains the label, rather than appearing twice.
  const byId = new Map<string, FeedShot>();
  for (const s of (shots ?? []) as unknown as FeedShot[]) byId.set(s.id, { ...s, profiles: one(s.profiles as never) });
  for (const r of ((rehypesRes.data ?? []) as RehypeRow[])) {
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
    const { data: placed } = await supabase.from("shots").select(SHOT_COLS).eq("id", ghostId).maybeSingle();
    if (placed) {
      const row = placed as unknown as FeedShot;
      byId.set(row.id, { ...row, profiles: one(row.profiles as never) });
    }
  }

  const ranked = diversify(
    [...byId.values()]
      .map((s) => {
        const own = shotScore(s, now, authorAff);
        const viaRehype = s._rehypedAt
          ? shotScore({ ...s, created_at: s._rehypedAt }, now, authorAff) + REHYPE_BOOST
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
    <ReelsFeed reels={reels as unknown as Reel[]} currentUserId={user?.id ?? null} {...adContext} />
  );
}
