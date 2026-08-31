import { Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReelsFeed } from "@/components/shots/ReelsFeed";
import { diversify } from "@/lib/feed-rank";
import { one, jsonRecord } from "@/lib/supabase/typed";

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

export default async function ShotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Candidate window + interaction affinity, ranked into a personalized reel.
  const [{ data: shots }, affRes] = await Promise.all([
    supabase
      .from("shots")
      .select("id, user_id, media_url, poster_url, caption, created_at, hype_count, comment_count, save_count, profiles(display_name, avatar_hue, avatar_url, username)")
      .order("created_at", { ascending: false })
      .limit(80),
    user ? supabase.rpc("get_affinity", { p_lookback_days: 60 }) : Promise.resolve({ data: null }),
  ]);

  const authorAff = jsonRecord((affRes.data as any)?.authors);
  const now = Date.now();

  const reels = diversify(
    (shots ?? [])
      .map((s: any) => ({ ...s, profiles: one(s.profiles) }))
      .map((s: any) => ({ ...s, _score: shotScore(s, now, authorAff) }))
      .sort((a: any, b: any) =>
        b._score !== a._score ? b._score - a._score : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
  );

  if (reels.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="The reel is empty"
        text="Short videos, big energy. Fire the first Shot."
        ctaLabel="Add Shot"
        ctaHref="/create/shot"
      />
    );
  }

  return <ReelsFeed reels={reels} currentUserId={user?.id ?? null} />;
}
