"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { BLANK_POSTER } from "@/lib/blank-poster";

/**
 * The Shots bolt: Phosphor's filled Lightning, the tab bar's own glyph, drawn
 * here as its path. Importing the icon library into the chat view for one
 * glyph cost seconds of load in the chat's tests — the same weight the chat
 * pays on a cold open.
 */
const BOLT =
  "M213.85,125.46l-112,120a8,8,0,0,1-13.69-7l14.66-73.33L45.19,143.49a8,8,0,0,1-3-13l112-120a8,8,0,0,1,13.69,7L153.18,90.9l57.63,21.61a8,8,0,0,1,3,12.95Z";

/** Every shared Shot is this wide, so a thread of them lines up. */
export const SHOT_CARD_W = 148;
/** The tallest a card gets: a phone Shot, 9:16. */
const TALLEST = 9 / 16;
/** The shortest: 4:3. Wider clips are cropped to it rather than shrinking to a sliver. */
const SHORTEST = 4 / 3;

/**
 * The card's shape, as width over height, from the clip's own size.
 *
 * Shots do not store their shape, so it is read off the poster (or the video,
 * when there is no poster) once it loads. Until then, and for anything that
 * cannot be measured, a phone Shot's 9:16 — which is what nearly all of them
 * are. Exported for tests.
 */
export function shotCardRatio(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return TALLEST;
  return Math.min(Math.max(width / height, TALLEST), SHORTEST);
}

export type SharedShot = {
  id: string;
  media_url: string;
  poster_url?: string | null;
  caption: string | null;
};

export type SharedShotAuthor = {
  username: string | null;
  display_name: string | null;
  avatar_hue: number | null;
  avatar_url?: string | null;
} | null;

/**
 * A Shot shared into a chat.
 *
 * The clip at its own shape, the author along the bottom, and the Shots bolt
 * in the top corner as the only mark of what it is — no play button, since
 * the whole card opens it.
 *
 * It draws the Shot's poster. It used to be a <video> with a blank poster,
 * and a <video> shows its poster instead of a frame until it plays, so a
 * shared Shot was a black box until it decoded. A Shot with no poster still
 * falls back to the video.
 */
export function SharedShotCard({
  shot,
  author,
  ...linkProps
}: {
  shot: SharedShot;
  author: SharedShotAuthor;
} & Omit<React.ComponentProps<typeof Link>, "href">) {
  const [ratio, setRatio] = useState(TALLEST);
  const name = author?.username ?? author?.display_name ?? "Someone";

  return (
    <Link
      href={`/shots/${shot.id}`}
      {...linkProps}
      aria-label={`Shot by ${name}`}
      className="relative block overflow-hidden rounded-2xl bg-black"
      style={{ width: SHOT_CARD_W, aspectRatio: String(ratio) }}
    >
      {shot.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shot.poster_url}
          alt={shot.caption ?? ""}
          draggable={false}
          onLoad={(e) => setRatio(shotCardRatio(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight))}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <video
          poster={BLANK_POSTER}
          src={`${shot.media_url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setRatio(shotCardRatio(e.currentTarget.videoWidth, e.currentTarget.videoHeight))}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      <svg
        viewBox="0 0 256 256"
        width={17}
        height={17}
        aria-hidden
        className="absolute right-2.5 top-2.5 fill-white drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.5)]"
      >
        <path d={BOLT} />
      </svg>

      {/* A fade under the name so it reads on any frame, bright ones included. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
        <Avatar
          name={name}
          hue={author?.avatar_hue ?? 200}
          size={22}
          src={author?.avatar_url ?? undefined}
          className="shrink-0 ring-[1.5px] ring-white/85"
        />
        <span className="truncate text-xs font-semibold text-white">{name}</span>
      </div>
    </Link>
  );
}
