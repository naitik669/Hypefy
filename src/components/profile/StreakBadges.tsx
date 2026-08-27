import { Flame, Star, Grid3x3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type Streak = {
  current_streak: number;
  longest_streak: number;
  total_posts: number;
  hypes_received: number;
};

/** Earned milestones, highest tier per track. Nothing renders until earned. */
function milestones(s: Streak): { icon: React.ReactNode; label: string }[] {
  const out: { icon: React.ReactNode; label: string }[] = [];

  const postTier = [100, 50, 10, 1].find((n) => s.total_posts >= n);
  if (postTier) {
    out.push({
      icon: <Grid3x3 size={12} />,
      label: postTier === 1 ? "First post" : `${postTier}+ posts`,
    });
  }

  const hypeTier = [10000, 1000, 100].find((n) => s.hypes_received >= n);
  if (hypeTier) {
    out.push({ icon: <Star size={12} className="fill-current" />, label: `${formatTier(hypeTier)} hypes` });
  }

  // Best streak ever, shown only when it beats the live one (which has its
  // own flame chip) so the two don't say the same thing twice.
  const streakTier = [100, 30, 7].find((n) => s.longest_streak >= n);
  if (streakTier && s.longest_streak > s.current_streak) {
    out.push({ icon: <Flame size={12} />, label: `${streakTier}-day best` });
  }

  return out;
}

function formatTier(n: number) {
  return n >= 1000 ? `${n / 1000}k` : String(n);
}

/**
 * Posting streak + earned milestones. Streaks are derived on read from
 * posts.created_at (see get_user_streak) so there's nothing to keep in sync.
 */
export async function StreakBadges({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_user_streak", { p_user_id: userId });

  const s = (Array.isArray(data) ? data[0] : data) as Streak | undefined;
  if (!s || s.total_posts === 0) return null;

  const earned = milestones(s);
  const live = s.current_streak >= 2;
  if (!live && earned.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {live && (
        <span className="inline-flex items-center gap-1 rounded-pill bg-hype/15 px-2 py-0.5 text-[11px] font-bold text-hype">
          <Flame size={12} className="fill-current" />
          {s.current_streak}-day streak
        </span>
      )}
      {earned.map((m) => (
        <span
          key={m.label}
          className="inline-flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted"
        >
          {m.icon}
          {m.label}
        </span>
      ))}
    </div>
  );
}
