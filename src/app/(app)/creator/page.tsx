import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, Users, UserRound, Film, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPrivateProfile } from "@/lib/profile";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatCount } from "@/lib/format";
import { BarChart } from "@/components/charts/BarChart";
import { CreatorModeIntro } from "@/components/creator/CreatorModeIntro";
import { CreatorTabs } from "@/components/creator/CreatorTabs";
import { ContentList } from "@/components/creator/ContentList";
import { Audience } from "@/components/creator/Audience";
import { Eyebrow, Figure } from "@/components/creator/Figures";
import { itemHref, itemTitle, type ItemKind } from "@/lib/creator-insights";
import { readTab } from "@/lib/creator-content";
import { bestRecent, dayLabel, oldestFirst, type DailyRow } from "@/lib/creator-overview";

/**
 * The creator dashboard.
 *
 * Three tabs, one fetched at a time and named in the address, the way
 * /activity does it: Overview answers "how is it going" in the first
 * screen, Content ranks everything you have posted, Audience is about the
 * people rather than the posts. Nothing is queried to sit behind a tab
 * nobody opened.
 *
 * Opt-in. Without creator mode this is the explanation and the switch,
 * which is also why the switch lives here rather than in settings — a
 * toggle in one place that reveals a screen in another is two steps and
 * no account of what the second one is for.
 */
export default async function CreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Through my_private_profile, not off the table. profiles grants per
  // column and its select policy is "viewable by everyone", so a granted
  // column is one anybody can read about anybody — which would have made
  // "who has creator tools on" a public list. See 0208.
  const mine = await getPrivateProfile(supabase);

  if (!mine?.creatorMode) {
    return (
      <>
        <PageHeader title="Creator tools" showBack />
        <CreatorModeIntro />
      </>
    );
  }

  const which = readTab(tab);

  // Newest first, then reversed: a plain ascending order with a limit
  // takes the thirty OLDEST days. See oldestFirst.
  const recentDays = () =>
    supabase
      .from("creator_daily_stats")
      .select("day, views, followers")
      .eq("user_id", user.id)
      .order("day", { ascending: false })
      .limit(30);

  return (
    <>
      <PageHeader title="Creator tools" showBack />
      <CreatorTabs tab={which} />

      {which === "content" && <Content supabase={supabase} />}
      {which === "audience" && <AudienceTab supabase={supabase} recentDays={recentDays} />}
      {which === "overview" && <Overview supabase={supabase} recentDays={recentDays} />}
    </>
  );
}

type Db = Awaited<ReturnType<typeof createClient>>;
type DayQuery = () => PromiseLike<{ data: DailyRow[] | null }>;

async function Content({ supabase }: { supabase: Db }) {
  const { data: items } = await supabase.rpc("creator_item_stats", { p_limit: 100 });
  return <ContentList items={items ?? []} />;
}

async function AudienceTab({
  supabase,
  recentDays,
}: {
  supabase: Db;
  recentDays: DayQuery;
}) {
  const [{ data: totalsRaw }, { data: visitsRaw }, { data: daysRaw }] = await Promise.all([
    supabase.rpc("creator_totals"),
    supabase.rpc("profile_view_stats", { p_days: 30 }),
    recentDays(),
  ]);

  return (
    <Audience
      days={oldestFirst(daysRaw ?? [])}
      totals={(totalsRaw ?? {}) as Record<string, number>}
      visits={(visitsRaw ?? {}) as Record<string, number>}
    />
  );
}

async function Overview({
  supabase,
  recentDays,
}: {
  supabase: Db;
  recentDays: DayQuery;
}) {
  const [{ data: totalsRaw }, { data: visitsRaw }, { data: daysRaw }, { data: items }] =
    await Promise.all([
      supabase.rpc("creator_totals"),
      supabase.rpc("profile_view_stats", { p_days: 30 }),
      recentDays(),
      supabase.rpc("creator_item_stats", { p_limit: 50 }),
    ]);

  const t = (totalsRaw ?? {}) as Record<string, number>;
  const v = (visitsRaw ?? {}) as Record<string, number>;
  const days = oldestFirst(daysRaw ?? []);

  const viewSeries = days.map((d) => ({ label: dayLabel(d.day), value: d.views ?? 0 }));
  const followerSeries = days.map((d) => d.followers ?? 0);
  const followerGain =
    days.length >= 2 ? (days[days.length - 1].followers ?? 0) - (days[0].followers ?? 0) : 0;

  const best = bestRecent(items ?? []);

  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-3">
      {/* The four figures worth a glance. */}
      <div className="grid grid-cols-2 gap-2.5">
        <Figure
          icon={<Eye size={15} />}
          label="Views"
          value={t.views ?? 0}
          spark={days.map((d) => d.views ?? 0)}
        />
        <Figure icon={<Users size={15} />} label="People reached" value={t.reach ?? 0} />
        <Figure
          icon={<UserRound size={15} />}
          label="Profile visits"
          value={v.visitors ?? 0}
          foot="last 30 days"
        />
        <Figure
          icon={<Users size={15} />}
          label="Followers"
          value={days.length ? (days[days.length - 1].followers ?? 0) : 0}
          spark={followerSeries}
          foot={
            followerGain !== 0
              ? `${followerGain > 0 ? "+" : ""}${followerGain} in 30 days`
              : undefined
          }
        />
      </div>

      <section>
        <Eyebrow>Views per day</Eyebrow>
        <BarChart points={viewSeries} unit="views" />
        {viewSeries.length > 0 && viewSeries.every((p) => p.value === 0) && (
          <p className="px-1 pt-1 text-[11px] text-faint">No views recorded in this window.</p>
        )}
      </section>

      {best && (
        <section>
          <Eyebrow>Doing best lately</Eyebrow>
          <Link
            href={itemHref(best.kind as ItemKind, best.id)}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-elevated"
          >
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-elevated">
              {best.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  loading="lazy"
                  decoding="async"
                  src={best.cover}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
              {best.kind === "shot" && (
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 p-0.5 text-white">
                  <Film size={9} />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {itemTitle(best.kind as ItemKind, best.caption)}
              </span>
              <span className="block text-xs text-muted">
                {formatCount(Number(best.views ?? 0))} views ·{" "}
                {formatCount(Number(best.reach ?? 0))} people
                {best.avg_completion != null ? ` · ${best.avg_completion}% watched` : ""}
              </span>
            </span>
            <ChevronRight size={17} className="shrink-0 text-faint" />
          </Link>
        </section>
      )}

      <Link
        href="/profile/insights"
        className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-elevated"
      >
        Totals and the full list
        <ChevronRight size={17} className="text-faint" />
      </Link>
    </div>
  );
}
