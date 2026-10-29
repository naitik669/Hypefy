import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Star, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import { TvArt } from "@/components/empty/scenes";
import { isRestricted } from "@/lib/show-audience";
import { SHOW_ARCHIVE_DAYS } from "@/lib/show-media";
import { NewCollabButton } from "@/components/shows/NewCollabButton";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { isVideoUrl } from "@/lib/video-mime";

/**
 * Your Shows.
 *
 * There was no route listing Shows at all — only /shows/[showId] and
 * /shows/add. The thing you most need to see is the one thing the app
 * never showed you: what is still up, and how long it has left.
 *
 * Two shelves. "Up now" is what people can see; "Archive" is everything
 * that has been and gone, which is yours alone and which the reaper
 * clears at SHOW_ARCHIVE_DAYS. The archive replaced a "Kept" shelf that
 * listed only the Shows carrying is_showcase — so every other Show you
 * had ever posted became unreachable the moment it expired.
 */
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  media_url: string;
  caption: string | null;
  expires_at: string;
  hype_count: number;
  audience: string;
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
      {/* Every tile was a <video>, so an ordinary photo Show — which is
          nearly all of them — drew as a blank black square in its own
          author's list. The viewer had the mirror of this bug. */}
      {isVideoUrl(s.media_url) ? (
        <video poster={BLANK_POSTER}
          src={s.media_url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={s.media_url}
          alt={s.caption ?? "Show"}
          className="h-full w-full object-cover"
        />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-bold text-white">
        {badge}
      </span>
      {s.hype_count > 0 && (
        <span className="absolute right-1.5 top-1.5 rounded-pill bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {s.hype_count}
        </span>
      )}
      {/* Which room it went to. Only ever drawn on a narrower one:
          "Everyone" on nearly every tile is a label that stops being
          read, and then the one that matters is not read either. */}
      {isRestricted(s.audience) && (
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-pill bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-hype">
          <Star size={9} className="fill-hype" />
          Hypers
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

  /**
   * The shared Shows you are in, and the ones you have been asked into.
   *
   * Through RLS: the collab policy returns only the ones you own, are
   * in, or were invited to, so there is nothing to filter here. The
   * membership rows come back for the same reason — which is what
   * separates an invitation from a membership on this screen.
   */
  const { data: collabRows } = await supabase
    .from("show_collab_members")
    .select("joined_at, collab:show_collabs!inner(id, title, owner_id)")
    .eq("user_id", user.id)
    .limit(40);

  const collabs = (collabRows ?? []).flatMap((r) => {
    const raw = (r as { collab: unknown }).collab;
    const c = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
    if (!c?.id) return [];
    return [{ id: c.id as string, title: c.title as string, joined: r.joined_at != null }];
  });

  const { data } = await supabase
    .from("shows")
    .select("id, media_url, caption, expires_at, hype_count, audience")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const all = (data ?? []) as Row[];
  const live = all.filter((s) => s.expires_at > nowIso);
  /**
   * Everything that has been and gone, yours alone.
   *
   * This was a "Kept" shelf holding only the Shows flagged is_showcase,
   * which meant every other Show you had ever posted was unreachable
   * the moment it expired — readable by id, listed nowhere. The policy
   * has always let you see your own past ones; there was simply no
   * screen. Now there is, and it holds all of them until the reaper
   * takes them at SHOW_ARCHIVE_DAYS.
   */
  const archive = all.filter((s) => s.expires_at <= nowIso);

  return (
    <>
      <PageHeader
        title="Your Shows"
        showBack
        right={
          <span className="flex items-center gap-2">
            <NewCollabButton />
            <Link
              href="/create?mode=show"
              aria-label="Add a Show"
              className="flex h-9 items-center gap-1 rounded-pill bg-accent px-3 text-xs font-bold text-accent-ink active:scale-[0.98]"
            >
              <Plus size={15} /> New
            </Link>
          </span>
        }
      />

      {live.length === 0 && archive.length === 0 && collabs.length === 0 ? (
        <EmptyScene
          art={<TvArt />}
          title="Nothing on tonight"
          text="Post a Show, it's gone in 24h."
          cta={
            <Link href="/create?mode=show" className={ctaClass}>
              Post a Show
            </Link>
          }
        />
      ) : (
        <div className="px-4 pb-10 pt-3">
          {collabs.length > 0 && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-faint">
                Shared
              </h2>
              <div className="mb-6 space-y-2">
                {collabs.map((c) => (
                  <Link
                    key={c.id}
                    href={`/shows/collab/${c.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-accent">
                      <Users size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{c.title}</span>
                      <span className="block text-xs text-muted">
                        {c.joined ? "You're in it" : "You were asked to join"}
                      </span>
                    </span>
                    {/* An invitation is the one row on this screen that
                        wants something from you, so it is the one row
                        that says so in the accent. */}
                    {!c.joined && (
                      <span className="shrink-0 rounded-pill bg-accent px-2.5 py-1 text-[11px] font-extrabold text-accent-ink">
                        Join
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </>
          )}

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

          {archive.length > 0 && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-faint">
                Archive
              </h2>
              <p className="mb-2 text-xs text-muted">
                Only you can see these. They go for good after {SHOW_ARCHIVE_DAYS} days.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {archive.map((s) => (
                  <Tile key={s.id} s={s} badge="Off air" />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
