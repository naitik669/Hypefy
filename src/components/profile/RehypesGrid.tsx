"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Repeat2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import { ReelArt } from "@/components/empty/scenes";
import { GRID, GRID_WRAP } from "@/components/profile/postGrid";
import { BLANK_POSTER } from "@/lib/blank-poster";

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

type Item =
  | {
      kind: "post";
      id: string;
      at: string;
      cover: string | null;
      caption: string | null;
      count: number;
    }
  | { kind: "shot"; id: string; at: string; media: string; poster: string | null };

type PostEmbed = { id: string; image_url: string | null; image_urls: string[] | null; caption: string | null };
type ShotEmbed = { id: string; media_url: string; poster_url: string | null };

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function RehypesGrid({
  userId,
  isOwn,
  name = "They",
}: {
  userId: string;
  isOwn: boolean;
  name?: string;
}) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let live = true;
    const supabase = createClient();
    (async () => {
      const [postsRes, shotsRes] = await Promise.all([
        supabase
          .from("reposts")
          .select("created_at, posts(id, image_url, image_urls, caption)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(PAGE),
        supabase
          .from("shot_reposts")
          .select("created_at, shots(id, media_url, poster_url)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(PAGE),
      ]);

      const posts: Item[] = (postsRes.data ?? []).flatMap((r) => {
        const p = first(r.posts as PostEmbed | PostEmbed[] | null);
        if (!p) return [];
        return [
          {
            kind: "post" as const,
            id: p.id,
            at: r.created_at,
            cover: p.image_url ?? p.image_urls?.[0] ?? null,
            caption: p.caption,
            count: p.image_urls?.length ?? 0,
          },
        ];
      });
      const shots: Item[] = (shotsRes.data ?? []).flatMap((r) => {
        const s = first(r.shots as ShotEmbed | ShotEmbed[] | null);
        if (!s) return [];
        return [{ kind: "shot" as const, id: s.id, at: r.created_at, media: s.media_url, poster: s.poster_url }];
      });

      if (!live) return;
      setItems([...posts, ...shots].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)));
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  if (items === null) {
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
    <div className={GRID_WRAP}>
      <div className={GRID}>
        {items.map((it) =>
          it.kind === "post" ? (
            <Link
              key={`p-${it.id}`}
              href={`/p/${it.id}`}
              className="relative block h-full overflow-hidden rounded-xl bg-surface"
            >
              {it.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.cover} alt={it.caption ?? "Post"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-start bg-elevated p-2">
                  <p className="line-clamp-4 text-[10px] leading-snug text-muted">{it.caption}</p>
                </div>
              )}
              <RehypeBadge />
              {it.count > 1 && (
                <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                  {it.count}
                </span>
              )}
            </Link>
          ) : (
            <Link
              key={`s-${it.id}`}
              href={`/shots/${it.id}`}
              className="relative block h-full overflow-hidden rounded-xl bg-surface"
            >
              <video
                poster={it.poster ?? BLANK_POSTER}
                src={it.media}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              <RehypeBadge />
              <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
                <Play size={14} className="fill-white" />
              </span>
            </Link>
          ),
        )}
      </div>
    </div>
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
