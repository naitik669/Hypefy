"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GridPeek } from "@/components/feed/GridPeek";
import { Play } from "lucide-react";
import { ShotPreview } from "@/components/shots/ShotPreview";
import { clampRatio, distribute, pinHeight } from "@/lib/masonry";
import { mixShots, type Mixed } from "@/lib/discover-mix";

export type Pin = {
  id: string;
  user_id: string;
  caption: string | null;
  body: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  /** width / height; drives the tile shape and the column balance. */
  aspect_ratio: number | null;
  hype_count: number;
  comment_count: number;
  created_at: string;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  } | null;
};

/** A Shot as a tile in the grid: its poster, or its first frame. */
export type ShotPin = {
  id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
};

type Tile = Mixed<Pin, ShotPin>;

/** Shared, so a feed with no Shots keeps a stable mix between renders. */
const NO_SHOTS: ShotPin[] = [];

/** A Shot is 9:16 — in column widths, 16/9 tall. */
const SHOT_HEIGHT = 16 / 9;

/** The same columns the server selects, so a fetched page renders the same. */
export const PIN_SELECT =
  "id, caption, body, image_url, image_urls, aspect_ratio, hype_count, comment_count, created_at, user_id, profiles!posts_user_id_fkey(display_name, username, avatar_hue, avatar_url)";

/** Tiles revealed per step, whether from memory or from the database. */
const STEP = 24;

/**
 * Three across. The app is one 480px column on every screen, so this is the
 * same on a phone and a desktop: about 150px a tile, which is small enough to
 * take in a whole screen of them at a glance — the point of browsing — and
 * big enough that a picture is still a picture.
 */
const COLUMNS = 3;

const imageOf = (p: Pin) => p.image_urls?.[0] ?? p.image_url ?? null;
const textOf = (p: Pin) => (p.caption ?? p.body ?? "").trim();

/**
 * A Pinterest-style feed of posts.
 *
 * Three columns on every screen (see COLUMNS). Tiles are placed by
 * `distribute`, shortest column first, which is what keeps a tile where it
 * is when more load beneath it.
 *
 * With `endless`, the feed never ends in a button. It shows what it already
 * has a step at a time, then asks the database for older posts, and it does
 * both on its own as you approach the bottom.
 */
export function PinFeed({
  posts,
  shots = NO_SHOTS,
  currentUserId,
  endless,
}: {
  posts: Pin[];
  /** Scattered through the posts, in a fixed pseudo-random pattern. */
  shots?: ShotPin[];
  currentUserId: string;
  /** Keep going past `posts`, fetching older ones, until there are none. */
  endless?: { cursor: string | null; blockedIds: string[] };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [extra, setExtra] = useState<Pin[]>([]);
  const [shown, setShown] = useState(endless ? STEP : Infinity);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!endless);
  const [failed, setFailed] = useState(false);

  // Posts alone, for the pagination cursor and de-duplication.
  const all = useMemo(() => [...posts, ...extra], [posts, extra]);

  // What is drawn: the Shots mixed through the posts that came with the page,
  // then every post loaded since. Shots mix only into that first stretch, so
  // a page arriving later is appended after them and never moves one.
  const mixed = useMemo(() => mixShots(posts, shots), [posts, shots]);
  const tiles = useMemo<Tile[]>(
    () => [...mixed, ...extra.map((item) => ({ kind: "post" as const, item }))],
    [mixed, extra]
  );
  const visible = useMemo(
    () => (Number.isFinite(shown) ? tiles.slice(0, shown) : tiles),
    [tiles, shown]
  );
  const columns = useMemo(
    () =>
      distribute(visible, COLUMNS, (t) =>
        t.kind === "shot"
          ? SHOT_HEIGHT
          : pinHeight({ aspect_ratio: t.item.aspect_ratio, hasImage: !!imageOf(t.item) })
      ),
    [visible]
  );

  // A ref so the observer's callback always sees the latest state without
  // being rebuilt for each change. Synced after commit, not during render.
  const state = useRef({ all, count: tiles.length, shown, loading, done, failed });
  useLayoutEffect(() => {
    state.current = { all, count: tiles.length, shown, loading, done, failed };
  });

  // How far back the database has been read. Separate from the posts we hold
  // because not every row it returns is kept — blocked authors and repeats
  // are dropped — and a cursor taken only from what is kept would stall on a
  // page that was entirely dropped, asking for the same rows forever.
  const readTo = useRef<string | null>(null);

  const fetchOlder = useCallback(async () => {
    if (!endless) return;
    const s = state.current;
    if (s.loading || s.done) return;
    setLoading(true);
    setFailed(false);

    // Older than everything we hold — the server's pool is the newest 150,
    // ranked, so "older" starts below its oldest post, not below the last
    // one on screen.
    const older = (a: string | null, b: string | null) =>
      a === null ? b : b === null ? a : a < b ? a : b;
    const oldest = s.all.reduce<string | null>(
      (min, p) => older(min, p.created_at),
      older(endless.cursor, readTo.current)
    );
    const blocked = new Set(endless.blockedIds);
    const seen = new Set(s.all.map((p) => p.id));

    let q = supabase
      .from("posts")
      .select(PIN_SELECT)
      .neq("user_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(STEP);
    if (oldest) q = q.lt("created_at", oldest);
    const { data, error } = await q;

    if (error) {
      setLoading(false);
      setFailed(true);
      return;
    }
    const rows = (data ?? []) as unknown as (Pin & { profiles: Pin["profiles"] | Pin["profiles"][] })[];
    readTo.current = rows.reduce<string | null>((min, r) => older(min, r.created_at), oldest);
    const fresh = rows
      .map((p) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? (p.profiles[0] ?? null) : p.profiles,
      }))
      .filter((p) => !blocked.has(p.user_id) && !seen.has(p.id));

    if (rows.length < STEP) setDone(true);
    setExtra((prev) => [...prev, ...fresh]);
    setShown((n) => n + STEP);
    setLoading(false);
  }, [endless, supabase, currentUserId]);

  const step = useCallback(() => {
    const s = state.current;
    if (s.loading || s.failed) return;
    if (s.shown < s.count) setShown((n) => n + STEP);
    else if (!s.done) void fetchOlder();
  }, [fetchOlder]);

  // Load as the bottom approaches. The observer is rebuilt after every step
  // on purpose: a fresh observer reports straight away, so if one step was
  // not enough to push the sentinel out of range — a short screen, a page of
  // landscape photos — the next step follows without waiting for a scroll.
  const sentinel = useRef<HTMLDivElement>(null);
  const more = !done || shown < tiles.length;
  useEffect(() => {
    if (!endless || !more) return;
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) step();
      },
      // About two screens ahead, so the next page is usually already there
      // by the time you reach it.
      { rootMargin: "1400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [endless, more, step, shown, extra.length]);

  return (
    <>
      {/* 8px gutters rather than 12: at three across, every pixel of gutter
          comes out of three pictures, and 8 is what the three-across search
          grid already uses. */}
      <div className="flex items-start gap-2 px-2">
        {columns.map((col, c) => (
          <div key={c} className="flex min-w-0 flex-1 flex-col gap-2">
            {col.map((t) =>
              t.kind === "shot" ? (
                <ShotTile key={`shot-${t.item.id}`} shot={t.item} />
              ) : (
                <PinTile key={t.item.id} pin={t.item} currentUserId={currentUserId} />
              )
            )}
            {/* One placeholder per column while a page is on its way,
                different heights so it reads as pins rather than a bar. */}
            {loading && (
              <div
                aria-hidden
                className="skeleton w-full rounded-2xl"
                style={{ aspectRatio: ["3 / 4", "1 / 1", "4 / 5"][c % 3] }}
              />
            )}
          </div>
        ))}
      </div>

      {endless && (
        <>
          <div ref={sentinel} aria-hidden className="h-px w-full" />
          {failed ? (
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                void fetchOlder();
              }}
              className="mx-auto mt-4 block rounded-pill bg-surface px-4 py-2 text-sm font-semibold text-muted"
            >
              Couldn&apos;t load more · Try again
            </button>
          ) : (
            !more &&
            tiles.length > 0 && (
              <p className="pt-6 text-center text-xs text-faint">
                You&apos;ve seen everything for now
              </p>
            )
          )}
        </>
      )}
    </>
  );
}

/**
 * A pin: the picture in its own shape, and nothing else.
 *
 * No caption, no author and no counters under or over it. Discover is for
 * looking, and a line of text and a name under every tile made the grid read
 * as a list of posts to get through rather than pictures to browse. Who made
 * it and what it says are one press away — holding a tile lifts the whole
 * post, author, caption and counts included — and the caption still rides on
 * the image as its alt text for anyone who cannot see it.
 */
function PinTile({ pin, currentUserId }: { pin: Pin; currentUserId: string }) {
  const img = imageOf(pin);
  const text = textOf(pin);
  const hue = pin.profiles?.avatar_hue ?? 280;
  const name = pin.profiles?.display_name ?? pin.profiles?.username ?? "Someone";

  return (
    <GridPeek
      currentUserId={currentUserId}
      className="block min-w-0"
      post={{
        id: pin.id,
        user_id: pin.user_id,
        caption: text || null,
        image: img,
        aspect_ratio: pin.aspect_ratio,
        hype_count: pin.hype_count,
        comment_count: pin.comment_count,
        author: pin.profiles
          ? {
              id: pin.user_id,
              name,
              username: pin.profiles.username ?? null,
              avatarUrl: pin.profiles.avatar_url ?? null,
              hue,
              verified: false,
            }
          : null,
      }}
    >
      <Link href={`/p/${pin.id}`} className="block">
        {img ? (
          <div
            className="overflow-hidden rounded-2xl bg-surface"
            style={{ aspectRatio: String(clampRatio(pin.aspect_ratio)) }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img}
              alt={text || `Post by ${name}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          // A post with no picture still earns a pin: its words, set large on
          // the author's colour, so it reads as a card rather than a hole.
          <div
            className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl p-3"
            style={{
              background: `linear-gradient(150deg, hsl(${hue} 55% 26%), hsl(${hue} 40% 12%))`,
            }}
          >
            <p className="line-clamp-5 text-center text-[13px] font-bold leading-snug text-white">
              {text}
            </p>
          </div>
        )}
      </Link>
    </GridPeek>
  );
}

/**
 * A Shot in the grid. Same bare treatment as a pin — no caption, no author —
 * with one small play mark, because a video you did not know was a video is a
 * surprise when it opens into the reel.
 */
function ShotTile({ shot }: { shot: ShotPin }) {
  return (
    <Link
      href={`/shots/${shot.id}`}
      aria-label={shot.caption ? `Shot: ${shot.caption}` : "Shot"}
      className="relative block aspect-[9/16] overflow-hidden rounded-2xl bg-black"
    >
<ShotPreview
        id={shot.id}
        src={shot.media_url}
        poster={shot.poster_url}
        alt={shot.caption ?? "Shot"}
        className="h-full w-full object-cover"
      />
      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
        <Play size={11} className="fill-white" />
      </span>
    </Link>
  );
}
