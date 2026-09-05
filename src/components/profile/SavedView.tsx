"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Folder, Loader2, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";

export type SavedItem = {
  id: string;
  kind: "post" | "shot";
  thumb: string | null;
  caption: string | null;
  savedAt: string;
};

export type SavedCollection = {
  id: string;
  name: string;
  coverUrl: string | null;
  count: number;
};

type Tab = "all" | "posts" | "shots";

/**
 * Saved posts and Shots, with the pagination the profile tab never had.
 *
 * Keyset paging on `saved_posts.created_at` / `saved_shots.created_at` — the
 * moment you saved it, not the moment it was posted — because that is the
 * order the list is shown in, and paging on a different column than you sort
 * by silently skips rows.
 */
export function SavedView({
  userId,
  initialPosts,
  initialShots,
  collections,
  pageSize,
}: {
  userId: string;
  initialPosts: SavedItem[];
  initialShots: SavedItem[];
  collections: SavedCollection[];
  pageSize: number;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("all");

  const [posts, setPosts] = useState(initialPosts);
  const [shots, setShots] = useState(initialShots);
  const [postsDone, setPostsDone] = useState(initialPosts.length < pageSize);
  const [shotsDone, setShotsDone] = useState(initialShots.length < pageSize);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    const wantPosts = tab !== "shots" && !postsDone;
    const wantShots = tab !== "posts" && !shotsDone;
    if (!wantPosts && !wantShots) return;

    busy.current = true;
    setLoading(true);

    if (wantPosts) {
      const cursor = posts[posts.length - 1]?.savedAt;
      const { data, error } = await supabase
        .from("saved_posts")
        .select("created_at, posts(id, image_url, image_urls, caption)")
        .eq("user_id", userId)
        .lt("created_at", cursor ?? new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(pageSize);
      // A failed page must not latch "done" — that turns a blip into a
      // permanently short list.
      if (!error) {
        const fresh = (data ?? []).flatMap((r: Record<string, unknown>) => {
          const p = one(r.posts as Record<string, unknown> | Record<string, unknown>[] | null);
          if (!p) return [];
          return [
            {
              id: p.id as string,
              kind: "post" as const,
              thumb:
                ((p.image_urls as string[] | null)?.[0] ??
                  (p.image_url as string | null)) ?? null,
              caption: (p.caption as string) ?? null,
              savedAt: r.created_at as string,
            },
          ];
        });
        setPosts((prev) => [...prev, ...fresh]);
        if ((data?.length ?? 0) < pageSize) setPostsDone(true);
      }
    }

    if (wantShots) {
      const cursor = shots[shots.length - 1]?.savedAt;
      const { data, error } = await supabase
        .from("saved_shots")
        .select("created_at, shots(id, media_url, poster_url, caption)")
        .eq("user_id", userId)
        .lt("created_at", cursor ?? new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(pageSize);
      if (!error) {
        const fresh = (data ?? []).flatMap((r: Record<string, unknown>) => {
          const s = one(r.shots as Record<string, unknown> | Record<string, unknown>[] | null);
          if (!s) return [];
          return [
            {
              id: s.id as string,
              kind: "shot" as const,
              thumb: ((s.poster_url as string) ?? (s.media_url as string)) ?? null,
              caption: (s.caption as string) ?? null,
              savedAt: r.created_at as string,
            },
          ];
        });
        setShots((prev) => [...prev, ...fresh]);
        if ((data?.length ?? 0) < pageSize) setShotsDone(true);
      }
    }

    setLoading(false);
    busy.current = false;
  }, [tab, posts, shots, postsDone, shotsDone, supabase, userId, pageSize]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const items =
    tab === "posts"
      ? posts
      : tab === "shots"
        ? shots
        : [...posts, ...shots].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));

  const done = tab === "posts" ? postsDone : tab === "shots" ? shotsDone : postsDone && shotsDone;

  return (
    <div className="flex flex-col">
      {collections.length > 0 && (
        <section className="border-b border-border/50 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold tracking-widest text-faint uppercase">
            Collections
          </p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/collections/${c.id}`}
                className="w-24 shrink-0"
              >
                <span className="relative block aspect-square overflow-hidden rounded-xl bg-surface">
                  {c.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.coverUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted">
                      <Folder size={22} />
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold">{c.name}</span>
                <span className="block text-[11px] text-faint">{c.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="sticky top-14 z-10 flex gap-1 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-xl">
        {(
          [
            ["all", "All"],
            ["posts", "Posts"],
            ["shots", "Shots"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
              tab === id
                ? "bg-accent text-accent-ink"
                : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          text="Tap the bookmark on any post or Shot and it waits for you here."
          variant="compact"
        />
      ) : (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {items.map((i) => (
            <Link
              key={`${i.kind}-${i.id}`}
              href={i.kind === "post" ? `/p/${i.id}` : `/shots/${i.id}`}
              className="relative aspect-square overflow-hidden bg-surface"
            >
              {i.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={i.thumb}
                  alt={i.caption ?? ""}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-tight text-muted">
                  {i.caption?.slice(0, 60) ?? "Post"}
                </span>
              )}
              {i.kind === "shot" && (
                <span className="pointer-events-none absolute top-1.5 right-1.5 text-white drop-shadow">
                  <Play size={13} fill="currentColor" />
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {!done && (
        <div ref={sentinel} className="flex justify-center py-6">
          {loading && <Loader2 size={18} className="animate-spin text-muted" />}
        </div>
      )}
    </div>
  );
}
