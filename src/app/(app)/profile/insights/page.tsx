import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, Bookmark, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCount } from "@/lib/format";
import { InsightsChart, type SeriesPoint } from "@/components/profile/InsightsChart";
import { CommentIcon } from "@/components/ui/CommentIcon";
import { HypeIcon } from "@/components/ui/HypeIcon";
import { itemHref, itemTitle, viewsPerPerson, type ItemKind } from "@/lib/creator-insights";

/**
 * Owner-only creator analytics.
 *
 * Views come from post_views and shot_views — one row per person per day,
 * written on a real dwell — and not from posts.view_count, which this page
 * used to read. That column is only bumped by increment_post_view, called
 * from the permalink and the profile modal and never from the home feed,
 * so it had drifted to about a eighteenth of the truth: 112 against 2,087
 * the day this was changed. See 0198.
 *
 * Shots are counted here too. shot_views has existed since 0132 and nothing
 * had ever read it, so the totals said "posts only" while the chart beside
 * them was already counting shot hypes — the screen disagreed with itself.
 *
 * Both numbers come from author-gated RPCs rather than from a select the
 * client could widen: the gate is inside the function, in the WHERE.
 */
export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: items }, { data: totalsRaw }, { data: series }, { data: history }] =
    await Promise.all([
      supabase.rpc("creator_item_stats", { p_limit: 200 }),
      // Totals are their own query rather than a sum of the list above: the
      // list is capped, and a total summed from a capped list goes quietly
      // wrong the day somebody passes the cap.
      supabase.rpc("creator_totals"),
      supabase.rpc("get_creator_timeseries", { p_days: 30 }),
      supabase
        .from("creator_daily_stats")
        .select("day, views, followers")
        .eq("user_id", user.id)
        .order("day", { ascending: true })
        .limit(30),
    ]);

  const rows = items ?? [];
  const t = (totalsRaw ?? {}) as Record<string, number>;
  const totals = {
    views: t.views ?? 0,
    reach: t.reach ?? 0,
    hypes: t.hypes ?? 0,
    comments: t.comments ?? 0,
    saves: t.saves ?? 0,
  };

  const chartSeries = (series ?? []) as SeriesPoint[];
  const days = history ?? [];
  const followerDelta =
    days.length >= 2
      ? (days[days.length - 1].followers ?? 0) - (days[0].followers ?? 0)
      : null;

  return (
    <>
      <PageHeader title="Insights" showBack />

      {rows.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="No data yet"
          text="Post something, your reach and engagement will show up here."
        />
      ) : (
        <div className="px-4 pb-10 pt-3">
          <div className="grid grid-cols-2 gap-2.5">
            <TotalCard icon={<Eye size={16} />} label="Views" value={totals.views} />
            <TotalCard
              icon={<Users size={16} />}
              label="People reached"
              value={totals.reach}
              /* Views counts every time it was seen; reach counts the people.
                 One person on three days is three views and one person. */
              note={viewsPerPerson(totals.views, totals.reach)}
            />
            <TotalCard icon={<HypeIcon size={16} className="text-hype" />} label="Hypes" value={totals.hypes} />
            <TotalCard icon={<CommentIcon size={16} />} label="Comments" value={totals.comments} />
            <TotalCard icon={<Bookmark size={16} />} label="Saves" value={totals.saves} />
          </div>

          <h2 className="px-1 pb-2 pt-6 text-xs font-bold uppercase tracking-widest text-faint">
            Over time
          </h2>
          <InsightsChart series={chartSeries} />

          {followerDelta !== null && (
            <p className="px-1 pt-2 text-xs text-muted">
              {followerDelta >= 0 ? "+" : ""}
              {followerDelta} follower{Math.abs(followerDelta) === 1 ? "" : "s"} since tracking began
            </p>
          )}

          <h2 className="px-1 pb-2 pt-6 text-xs font-bold uppercase tracking-widest text-faint">
            Every post and Shot
          </h2>
          <div className="flex flex-col gap-1">
            {rows.map((p) => (
              <Link
                key={`${p.kind}:${p.id}`}
                href={itemHref(p.kind as ItemKind, p.id)}
                className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-white/[0.03]"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                  {p.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={p.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-1 text-[8px] text-faint">
                      {p.caption ?? "Post"}
                    </div>
                  )}
                  {p.kind === "shot" && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 p-0.5 text-white">
                      <Zap size={9} />
                    </span>
                  )}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-muted">
                  {itemTitle(p.kind as ItemKind, p.caption)}
                </p>
                <div className="flex shrink-0 items-center gap-3 text-xs font-semibold tabular-nums text-muted">
                  <span className="flex items-center gap-1">
                    <Eye size={13} /> {formatCount(Number(p.views ?? 0))}
                  </span>
                  <span className="flex items-center gap-1">
                    <HypeIcon size={13} /> {formatCount(p.hypes ?? 0)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function TotalCard({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-black tabular-nums">{formatCount(value)}</p>
      {note && <p className="text-[11px] text-faint">{note}</p>}
    </div>
  );
}
