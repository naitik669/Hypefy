"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GridPeek } from "@/components/feed/GridPeek";
import { RichPostText } from "@/components/ui/RichPostText";
import { GRID, GRID_WRAP } from "@/components/profile/postGrid";
import { BLANK_POSTER } from "@/lib/blank-poster";

/**
 * A profile's Posts and Shots grids, once.
 *
 * Your own profile and everyone else's each had their own copy of these, and
 * the copies had drifted: yours loaded more as you scrolled and theirs
 * stopped dead at thirty; neither could be held to look closer, though every
 * other grid in the app can. One of each now, used by both.
 */

/** How many arrive at a time. */
export const PROFILE_PAGE = 30;

/**
 * A list that loads its next page when its end scrolls into view.
 *
 * `load(before)` returns the page older than `before` (null for the first).
 * A short page means that was the last of them. Rows are told apart by id,
 * so a row that arrives twice — two posts in the same instant straddling a
 * page — is shown once.
 */
export function usePaged<T extends { id: string; created_at: string }>(
  load: (before: string | null) => Promise<T[]>,
) {
  const [items, setItems] = useState<T[] | null>(null);
  const [more, setMore] = useState(true);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const next = useCallback(
    async (current: T[] | null) => {
      if (busy.current) return;
      busy.current = true;
      const before = current?.length ? current[current.length - 1].created_at : null;
      const page = await load(before);
      busy.current = false;
      setItems((prev) => appendPage(prev ?? [], page));
      setMore(page.length === PROFILE_PAGE);
    },
    [load],
  );

  // The first page. Another profile is another grid: callers key these by
  // user, so this never has to throw away one person's posts for the next.
  useEffect(() => {
    void next(null);
  }, [next]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || items === null) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && void next(items), { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [items, more, next]);

  return { items, more, sentinel };
}

/** Add a page to what is there, skipping anything already shown. Exported for tests. */
export function appendPage<T extends { id: string }>(have: T[], page: T[]): T[] {
  const seen = new Set(have.map((r) => r.id));
  return [...have, ...page.filter((r) => !seen.has(r.id))];
}

type PostRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
  created_at: string;
  aspect_ratio: number | null;
  hype_count: number | null;
  comment_count: number | null;
};

type ShotRow = {
  id: string;
  user_id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
  created_at: string;
  hype_count: number | null;
  comment_count: number | null;
};

export function PostsGrid({
  userId,
  viewerId,
  fromProfile = false,
  empty,
}: {
  userId: string;
  /** Who is looking, so a held post knows what they have hyped and saved. */
  viewerId?: string | null;
  /** Your own profile: the post page then continues with the rest of it, in order. */
  fromProfile?: boolean;
  /** What to show when there are none. */
  empty: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const load = useCallback(
    async (before: string | null) => {
      let q = supabase
        .from("posts")
        .select("id, user_id, image_url, image_urls, caption, created_at, aspect_ratio, hype_count, comment_count")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PROFILE_PAGE);
      if (before) q = q.lt("created_at", before);
      const { data } = await q;
      return (data ?? []) as PostRow[];
    },
    [supabase, userId],
  );
  const { items, more, sentinel } = usePaged(load);

  if (items === null) return <GridSkeleton />;
  if (items.length === 0) return <>{empty}</>;

  return (
    <div>
      <div className={GRID_WRAP}>
        <div className={GRID}>
          {items.map((p) => {
            const cover = p.image_urls?.[0] ?? p.image_url ?? null;
            const count = p.image_urls?.length ?? 0;
            return (
              <GridPeek
                key={p.id}
                currentUserId={viewerId ?? undefined}
                className="relative block h-full overflow-hidden rounded-xl bg-surface"
                post={{
                  id: p.id,
                  user_id: p.user_id,
                  caption: p.caption,
                  image: cover,
                  aspect_ratio: p.aspect_ratio,
                  hype_count: p.hype_count ?? 0,
                  comment_count: p.comment_count ?? 0,
                  author: null,
                }}
              >
                <Link href={fromProfile ? `/p/${p.id}?from=profile` : `/p/${p.id}`} className="block h-full">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={p.caption ?? "Post"} draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-start bg-elevated p-2">
                      <p className="line-clamp-4 text-[10px] leading-snug text-muted">
                        <RichPostText text={p.caption ?? ""} />
                      </p>
                    </div>
                  )}
                  {count > 1 && (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                      {count}
                    </span>
                  )}
                </Link>
              </GridPeek>
            );
          })}
        </div>
      </div>
      {more && <div ref={sentinel} className="h-8" />}
    </div>
  );
}

export function ShotsGrid({
  userId,
  viewerId,
  empty,
}: {
  userId: string;
  viewerId?: string | null;
  empty: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const load = useCallback(
    async (before: string | null) => {
      let q = supabase
        .from("shots")
        .select("id, user_id, media_url, poster_url, caption, created_at, hype_count, comment_count")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PROFILE_PAGE);
      if (before) q = q.lt("created_at", before);
      const { data } = await q;
      return (data ?? []) as ShotRow[];
    },
    [supabase, userId],
  );
  const { items, more, sentinel } = usePaged(load);

  if (items === null) return <GridSkeleton />;
  if (items.length === 0) return <>{empty}</>;

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 px-1.5">
        {items.map((s) => (
          <GridPeek
            key={s.id}
            kind="shot"
            currentUserId={viewerId ?? undefined}
            className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface"
            post={{
              id: s.id,
              user_id: s.user_id,
              caption: s.caption,
              image: s.poster_url,
              video: s.media_url,
              aspect_ratio: 9 / 16,
              hype_count: s.hype_count ?? 0,
              comment_count: s.comment_count ?? 0,
              author: null,
            }}
          >
            <Link href={`/shots/${s.id}`} className="block h-full" aria-label={s.caption ? `Shot: ${s.caption}` : "Shot"}>
              <ShotCover poster={s.poster_url} media={s.media_url} />
              <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
                <Play size={14} className="fill-white" />
              </span>
            </Link>
          </GridPeek>
        ))}
      </div>
      {more && <div ref={sentinel} className="h-8" />}
    </div>
  );
}

/**
 * A Shot's still, for a tile.
 *
 * Its poster where it has one, as a picture: a <video> shows its poster
 * attribute instead of a frame until it plays, and these tiles pinned that
 * to a blank image, so every Shot on a profile was a black square. Only a
 * Shot with no poster falls back to the video, asked for a frame with #t.
 */
export function ShotCover({ poster, media }: { poster: string | null; media: string }) {
  if (poster) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" draggable={false} className="h-full w-full object-cover" />;
  }
  return (
    <video
      poster={BLANK_POSTER}
      src={`${media}#t=0.1`}
      className="h-full w-full object-cover"
      muted
      playsInline
      preload="metadata"
    />
  );
}

/** The grid's own shape while it loads, so nothing shifts when the tiles land. */
export function GridSkeleton() {
  return (
    <div className={GRID_WRAP}>
      <div className={GRID}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-full animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
