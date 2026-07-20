import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, Star, MessageCircle, Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCount } from "@/lib/format";

/** Owner-only creator analytics: per-post and total reach/engagement. */
export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: posts } = await supabase
    .from("posts")
    .select("id, caption, image_url, image_urls, view_count, hype_count, comment_count, save_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = posts ?? [];
  const totals = rows.reduce(
    (acc, p: any) => ({
      views: acc.views + (p.view_count ?? 0),
      hypes: acc.hypes + (p.hype_count ?? 0),
      comments: acc.comments + (p.comment_count ?? 0),
      saves: acc.saves + (p.save_count ?? 0),
    }),
    { views: 0, hypes: 0, comments: 0, saves: 0 },
  );

  const cover = (p: any): string | null => p.image_url ?? p.image_urls?.[0] ?? null;

  return (
    <>
      <PageHeader title="Insights" showBack />

      {rows.length === 0 ? (
        <EmptyState icon={Eye} title="No data yet" text="Post something, your reach and engagement will show up here." />
      ) : (
        <div className="px-4 pb-10 pt-3">
          {/* Totals */}
          <div className="grid grid-cols-2 gap-2.5">
            <TotalCard icon={<Eye size={16} />} label="Views" value={totals.views} />
            <TotalCard icon={<Star size={16} className="text-hype" />} label="Hypes" value={totals.hypes} />
            <TotalCard icon={<MessageCircle size={16} />} label="Comments" value={totals.comments} />
            <TotalCard icon={<Bookmark size={16} />} label="Saves" value={totals.saves} />
          </div>

          {/* Per-post breakdown */}
          <h2 className="px-1 pb-2 pt-6 text-xs font-bold uppercase tracking-widest text-faint">Per post</h2>
          <div className="flex flex-col gap-1">
            {rows.map((p: any) => (
              <Link key={p.id} href={`/p/${p.id}`} className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-white/[0.03]">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                  {cover(p) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover(p)!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-1 text-[8px] text-faint">{p.caption ?? "Post"}</div>
                  )}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-muted">{p.caption ?? "Untitled post"}</p>
                <div className="flex shrink-0 items-center gap-3 text-xs font-semibold tabular-nums text-muted">
                  <span className="flex items-center gap-1"><Eye size={13} /> {formatCount(p.view_count ?? 0)}</span>
                  <span className="flex items-center gap-1"><Star size={13} /> {formatCount(p.hype_count ?? 0)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function TotalCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted">{icon}<span className="text-xs font-semibold">{label}</span></div>
      <p className="mt-1 text-2xl font-black tabular-nums">{formatCount(value)}</p>
    </div>
  );
}
