"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Repeat2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import { ReelArt } from "@/components/empty/scenes";
import { GridPeek } from "@/components/feed/GridPeek";
import { GridSkeleton, ShotCover } from "@/components/profile/ProfileGrids";
import { GRID, GRID_WRAP } from "@/components/profile/postGrid";

/**
 * The Rehypes tab: what this person passed on to their followers.
 *
 * Posts and Shots live in two tables, so they are fetched side by side and
 * merged by *when they were rehyped*, newest first — the order someone would
 * remember doing it in, not the order the originals were posted.
 *
 * Visible to everyone, the way a reshare is anywhere else. The database still
 * decides what each viewer gets: a private account's rehypes only reach its
 * followers, and a rehyped post or Shot that the viewer cannot see (removed,
 * or from a private account they do not follow) is simply absent.
 */

const PAGE = 30;

export type RehypeItem =
  | {
      kind: "post";
      id: string;
      at: string;
      cover: string | null;
      caption: string | null;
      count: number;
      ratio: number | null;
      /** Whose it is: the username of the person who made it. */
      by: string | null;
    }
  | { kind: "shot"; id: string; at: string; media: string; poster: string | null; caption: string | null; by: string | null };

type Maker = { username: string | null };

type PostEmbed = {
  id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
  aspect_ratio: number | null;
  profiles: Maker | Maker[] | null;
};
type ShotEmbed = {
  id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
  profiles: Maker | Maker[] | null;
};

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * One page out of two lists.
 *
 * Each table is asked for a page older than the cursor, and the two answers
 * are merged by rehype time. Only the newest `page` of the merge are shown;
 * the rest are left for next time, when the cursor (the last one shown) will
 * fetch them again. That is the only way the order stays right: showing all
 * sixty would put a Shot from last month above a post from last week that the
 * posts table had not got to yet.
 *
 * There is more to come if the merge had leftovers, or either table gave a
 * full page (it may have more behind it). Exported for tests.
 */
export function mergeRehypePage(
  posts: RehypeItem[],
  shots: RehypeItem[],
  page = PAGE,
): { items: RehypeItem[]; more: boolean } {
  const merged = [...posts, ...shots].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return {
    items: merged.slice(0, page),
    more: merged.length > page || posts.length >= page || shots.length >= page,
  };
}

export function RehypesGrid({
  userId,
  isOwn,
  name = "They",
  viewerId,
}: {
  userId: string;
  isOwn: boolean;
  name?: string;
  /** Who is looking, so a held tile knows what they have hyped and saved. */
  viewerId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<RehypeItem[] | null>(null);
  const [more, setMore] = useState(true);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (current: RehypeItem[] | null) => {
      if (busy.current) return;
      busy.current = true;
      const before = current?.length ? current[current.length - 1].at : null;
      let pq = supabase
        .from("reposts")
        .select("created_at, posts(id, image_url, image_urls, caption, aspect_ratio, profiles!posts_user_id_fkey(username))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      let sq = supabase
        .from("shot_reposts")
        .select("created_at, shots(id, media_url, poster_url, caption, profiles(username))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (before) {
        pq = pq.lt("created_at", before);
        sq = sq.lt("created_at", before);
      }
      const [postsRes, shotsRes] = await Promise.all([pq, sq]);

      const posts: RehypeItem[] = (postsRes.data ?? []).flatMap((r) => {
        const p = first(r.posts as PostEmbed | PostEmbed[] | null);
        if (!p) return [];
        return [
          {
            kind: "post" as const,
            id: p.id,
            at: r.created_at,
            cover: p.image_urls?.[0] ?? p.image_url ?? null,
            caption: p.caption,
            count: p.image_urls?.length ?? 0,
            ratio: p.aspect_ratio,
            by: first(p.profiles)?.username ?? null,
          },
        ];
      });
      const shots: RehypeItem[] = (shotsRes.data ?? []).flatMap((r) => {
        const s = first(r.shots as ShotEmbed | ShotEmbed[] | null);
        if (!s) return [];
        return [
          {
            kind: "shot" as const,
            id: s.id,
            at: r.created_at,
            media: s.media_url,
            poster: s.poster_url,
            caption: s.caption,
            by: first(s.profiles)?.username ?? null,
          },
        ];
      });

      // "More" is judged on what the tables returned, not on what survived:
      // a full page of rehypes whose originals were all removed is not the end.
      const page = mergeRehypePage(posts, shots);
      const full = (postsRes.data?.length ?? 0) >= PAGE || (shotsRes.data?.length ?? 0) >= PAGE;
      busy.current = false;
      setItems((prev) => {
        const have = prev ?? [];
        const seen = new Set(have.map((i) => `${i.kind}-${i.id}`));
        return [...have, ...page.items.filter((i) => !seen.has(`${i.kind}-${i.id}`))];
      });
      setMore(page.more || full);
    },
    [supabase, userId],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || items === null) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && void load(items), { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [items, more, load]);

  if (items === null) return <GridSkeleton />;

  if (items.length === 0) {
    return (
      <EmptyScene
        art={<ReelArt />}
        title={isOwn ? "Nothing rehyped yet" : "No rehypes"}
        text={
          isOwn
            ? "Tap the arrows on a post or Shot to pass it on to your followers."
            : `${name} hasn't rehyped anything yet.`
        }
        timing={{ head: 1.1, sub: 1.45, cta: 1.8 }}
        cta={
          isOwn ? (
            <Link href="/discover" className={ctaClass}>
              Find something to rehype
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      <div className={GRID_WRAP}>
        <div className={GRID}>
          {items.map((it) => (
            // Holdable, like every other grid. The peek finds out who owns it
            // and what it has collected as it opens.
            <GridPeek
              key={`${it.kind}-${it.id}`}
              kind={it.kind}
              currentUserId={viewerId ?? undefined}
              className="relative block h-full overflow-hidden rounded-xl bg-surface"
              post={{
                id: it.id,
                user_id: "",
                caption: it.caption,
                image: it.kind === "post" ? it.cover : it.poster,
                video: it.kind === "shot" ? it.media : null,
                aspect_ratio: it.kind === "post" ? it.ratio : 9 / 16,
                hype_count: 0,
                comment_count: 0,
                author: null,
              }}
            >
              {it.kind === "post" ? (
                <Link href={`/p/${it.id}`} className="block h-full">
                  {it.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.cover} alt={it.caption ?? "Post"} draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-start bg-elevated p-2">
                      <p className="line-clamp-4 text-[10px] leading-snug text-muted">{it.caption}</p>
                    </div>
                  )}
                  <RehypeBadge />
                  <MadeBy username={it.by} />
                  {it.count > 1 && (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                      {it.count}
                    </span>
                  )}
                </Link>
              ) : (
                <Link href={`/shots/${it.id}`} className="block h-full" aria-label={it.caption ? `Shot: ${it.caption}` : "Shot"}>
                  <ShotCover poster={it.poster} media={it.media} />
                  <RehypeBadge />
                  <MadeBy username={it.by} />
                  <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
                    <Play size={14} className="fill-white" />
                  </span>
                </Link>
              )}
            </GridPeek>
          ))}
        </div>
      </div>
      {more && <div ref={sentinel} className="h-8" />}
    </div>
  );
}

/**
 * Whose work it is, on the tile.
 *
 * The mark in the corner said "this is a rehype" and nothing about of whom,
 * so a profile's Rehypes tab was a wall of other people's work with no names
 * on it. The name goes along the foot of each tile.
 */
function MadeBy({ username }: { username: string | null }) {
  if (!username) return null;
  return (
    <span
      data-made-by
      className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-bold text-white"
    >
      @{username}
    </span>
  );
}

/** A small mark so a rehype never reads as the person's own post. */
function RehypeBadge() {
  return (
    <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-accent backdrop-blur-sm">
      <Repeat2 size={12} strokeWidth={2.6} />
    </span>
  );
}
