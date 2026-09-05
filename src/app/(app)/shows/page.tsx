import Link from "next/link";
import { redirect } from "next/navigation";
import { Clapperboard, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Your Shows.
 *
 * There was no route listing Shows at all — only /shows/[showId] and
 * /shows/add. Your own expire after 24 hours unless flagged is_showcase, so
 * the thing you most need to see is the one thing the app never showed you:
 * what is still up, and how long it has left.
 */
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  media_url: string;
  caption: string | null;
  expires_at: string;
  is_showcase: boolean | null;
  hype_count: number;
};

/** "4h left" / "18m left" — the number that decides whether you act. */
function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "gone";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h left`;
}

function Tile({ s, badge }: { s: Row; badge: string }) {
  return (
    <Link
      href={`/shows/${s.id}`}
      className="relative aspect-[3/4] overflow-hidden rounded-xl bg-black"
    >
      <video
        src={s.media_url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-bold text-white">
        {badge}
      </span>
      {s.hype_count > 0 && (
        <span className="absolute right-1.5 top-1.5 rounded-pill bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {s.hype_count}
        </span>
      )}
    </Link>
  );
}

export default async function ShowsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("shows")
    .select("id, media_url, caption, expires_at, is_showcase, hype_count")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const all = (data ?? []) as Row[];
  const live = all.filter((s) => s.expires_at > nowIso);
  // Expired but kept: the only Shows that survive the 24h window, and until
  // now there was nowhere to look at them.
  const kept = all.filter((s) => s.expires_at <= nowIso && s.is_showcase);

  return (
    <>
      <PageHeader
        title="Your Shows"
        showBack
        right={
          <Link
            href="/shows/add"
            aria-label="Add a Show"
            className="flex h-9 items-center gap-1 rounded-pill bg-accent px-3 text-xs font-bold text-accent-ink active:scale-[0.98]"
          >
            <Plus size={15} /> New
          </Link>
        }
      />

      {live.length === 0 && kept.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No Shows yet"
          text="A Show is a short clip that disappears after 24 hours — unless you keep it."
          ctaLabel="Add a Show"
          ctaHref="/shows/add"
        />
      ) : (
        <div className="px-4 pb-10 pt-3">
          {live.length > 0 && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-faint">
                Up now
              </h2>
              <div className="mb-6 grid grid-cols-3 gap-2">
                {live.map((s) => (
                  <Tile key={s.id} s={s} badge={timeLeft(s.expires_at)} />
                ))}
              </div>
            </>
          )}

          {kept.length > 0 && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-faint">
                Kept
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {kept.map((s) => (
                  <Tile key={s.id} s={s} badge="Kept" />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
