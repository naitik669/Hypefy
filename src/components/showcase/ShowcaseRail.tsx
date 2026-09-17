"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Television, Plus } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { BLANK_POSTER } from "@/lib/blank-poster";

type Board = {
  id: string;
  title: string;
  cover: string | null;
  /** True when the cover is a video frame rather than an image. */
  coverIsVideo: boolean;
  count: number;
};

/**
 * Showcase boards on a profile.
 *
 * This replaces a flat rail of everything pinned — every Shot with
 * in_showcase and every Show with is_showcase, in one undifferentiated row
 * you could neither name nor split. Boards are named groups, as many as you
 * like, and tapping one plays it through like a Show rather than opening a
 * single item and stopping.
 *
 * Squircles rather than the circles this pattern usually gets: circles are
 * for people in this app — every avatar is one — and a board is a place, not
 * a person.
 */
export function ShowcaseRail({
  userId,
  isOwn,
}: {
  userId: string;
  isOwn: boolean;
}) {
  const [boards, setBoards] = useState<Board[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("showcases")
        .select(
          "id, title, cover_url, position, created_at, showcase_items(media_url, poster_url, position, created_at, shows(media_url), shots(media_url, poster_url))",
        )
        .eq("user_id", userId)
        .order("position")
        .order("created_at");

      if (!active) return;

      setBoards(
        ((data ?? []) as Record<string, unknown>[]).map((b) => {
          const items = (b.showcase_items ?? []) as Record<string, unknown>[];
          // Board order, so "the cover is the first thing in it" means the
          // thing you actually see first.
          const sorted = [...items].sort(
            (x, y) =>
              (x.position as number) - (y.position as number) ||
              String(x.created_at).localeCompare(String(y.created_at)),
          );
          const first = sorted[0];
          const show = first?.shows as { media_url?: string } | null;
          const shot = first?.shots as {
            media_url?: string;
            poster_url?: string | null;
          } | null;

          // Prefer a still: a poster, then the board's own cover, then the
          // video itself as a last resort. A frame pulled from a video is
          // slower and heavier than an image that already exists.
          const poster =
            (first?.poster_url as string | null) ?? shot?.poster_url ?? null;
          const video =
            (first?.media_url as string | null) ??
            show?.media_url ??
            shot?.media_url ??
            null;
          const explicit = b.cover_url as string | null;

          const cover = explicit ?? poster ?? video ?? null;
          return {
            id: b.id as string,
            title: b.title as string,
            cover,
            coverIsVideo: !explicit && !poster && !!video,
            count: items.length,
          };
        }),
      );
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!boards) return null;
  // Someone else's empty profile should not carry an empty heading; your own
  // should, because the heading is where you go to make the first one.
  if (boards.length === 0 && !isOwn) return null;

  return (
    <div className="mt-3 px-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-faint">
        <Television size={14} weight="fill" />
        Showcase
      </p>

      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {isOwn && (
          <Link
            href="/showcase/new"
            className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
          >
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[24px] border-2 border-dashed border-border text-faint transition-colors active:border-accent active:text-accent">
              <Plus size={24} weight="bold" />
            </span>
            <span className="w-full truncate text-center text-[11px] font-semibold text-muted">
              New
            </span>
          </Link>
        )}

        {boards.map((b) => (
          <Link
            key={b.id}
            href={`/showcase/${b.id}`}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
          >
            <span className="relative h-[72px] w-[72px] overflow-hidden rounded-[24px] border border-border bg-surface">
              {b.cover ? (
                b.coverIsVideo ? (
                  // #t=0.1 forces a decoded frame; preload="metadata" alone is
                  // not obliged to produce one and Safari does not.
                  <video poster={BLANK_POSTER}
                    src={`${b.cover}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.cover}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )
              ) : (
                // An empty board is a real state — you make one before you
                // fill it — so it gets the Showcase glyph rather than a blank
                // square that reads as a broken image.
                <span className="flex h-full w-full items-center justify-center text-faint">
                  <Television size={26} weight="fill" />
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-[11px] font-semibold text-foreground">
              {b.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
