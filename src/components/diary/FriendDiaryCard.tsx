"use client";

import { useRef } from "react";
import { PageCaption } from "@/components/diary/PageCaption";
import { PagePhoto } from "@/components/diary/PagePhoto";
import Link from "next/link";
import { Maximize2, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SongLine } from "@/components/diary/DiaryDisc";
import { DiaryResponder, HypeStar } from "@/components/diary/DiaryResponder";
import { diaryTheme, fillSize, lifeLeft, lineSize, timeAgo } from "@/components/diary/DiaryPage";
import type { DiaryEntry } from "@/lib/diary";

/**
 * Every card in the spotlight is the same height, so they sit square as a
 * deck — only a little taller than it is wide, sized to the screen by the
 * spotlight (--card-h); 314px wherever that is not set.
 */
export const CARD_H = "var(--card-h, 314px)";

/**
 * One friend's page as a card — in the spotlight deck, or one to a row in the
 * list under it.
 *
 * The whole page is on it: who wrote it, the words (at most 60 characters,
 * which always fit), the song, and the row to react, hype and reply. The
 * cards behind the top one are drawn the same way but inert — you see their
 * colour and edges, and act on the one in front.
 */
export function FriendDiaryCard({
  entry,
  fresh,
  mine,
  onReacted,
  hyped = false,
  onHyped,
  onOpen,
  inert = false,
  size: shape = "spotlight",
}: {
  entry: DiaryEntry;
  fresh: boolean;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  hyped?: boolean;
  onHyped?: (userId: string, hyped: boolean) => void;
  onOpen: () => void;
  /** A card behind the top one: shown, not usable. */
  inert?: boolean;
  /** "spotlight": the fixed, larger card of the deck. "list": as tall as it needs. */
  size?: "spotlight" | "list";
}) {
  const avatar = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLElement>(null);
  const theme = diaryTheme(entry.color, entry.hue);
  const big = shape === "spotlight";
  const first = entry.name.split(" ")[0];
  // In the deck a photo page is the photo: it fills the card edge to edge,
  // with the name above it and the words on a dark label at its foot.
  const bleed = big && !!entry.imageUrl;

  return (
    <article
      ref={card}
      inert={inert}
      aria-hidden={inert || undefined}
      className="relative flex flex-col overflow-hidden rounded-[28px]"
      style={{ height: big ? CARD_H : undefined, background: theme.background, boxShadow: theme.shadow }}
    >
      {bleed && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open this page"
          data-swipe-through
          className="absolute inset-0 block"
        >
          {/* A blurred, dimmed copy of the photo, filling the card behind
              it. The card is a fixed near-square and a phone shoots tall, so
              filling it with the photo itself cost the top of the head and
              the chin; contained on a bed of itself, the frame is whole and
              the card still has no empty corners. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.imageUrl!}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-[22px] brightness-[0.42] saturate-[0.7]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.imageUrl!} alt="" draggable={false} className="relative h-full w-full object-contain" />
          {/* Shade at the top and foot, so the name and the reply row read
              on any photo, however bright. Lighter than it was: the bed is
              already dark, and the foot no longer has a song sitting on it. */}
          <span
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.45),transparent_24%,transparent_66%,rgba(0,0,0,.6))]"
          />
        </button>
      )}
      {/* Over a photo this layer lets taps through to it, except where
          there is something to press. */}
      <div
        className={`relative flex min-h-0 flex-1 flex-col px-4 pt-3.5 ${big ? "pb-2.5" : "gap-3 pb-3"} ${bleed ? "pointer-events-none" : ""}`}
      >
        {/* Who, and how long it has left — one block on the left; opening it
            full-screen on the right. */}
        <header className="pointer-events-auto flex items-center gap-2.5">
          <Link href={entry.username ? `/u/${entry.username}` : "#"} className="flex min-w-0 items-center gap-2.5">
            <span ref={avatar} className="shrink-0 rounded-full">
              <Avatar name={entry.name} hue={entry.hue} size={34} src={entry.avatarUrl ?? undefined} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-bold leading-tight text-white">{entry.name}</span>
                {entry.audience === "close" && (
                  <Star size={11} className="shrink-0 fill-accent text-accent" aria-label="Close friends" />
                )}
                {fresh && <span aria-label="New" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              </span>
              <span className="text-[11px] leading-tight tabular-nums text-white/50" suppressHydrationWarning>
                {timeAgo(entry.createdAt)}
              </span>
            </span>
          </Link>
          {/* The hype star, up here: the row at the foot is the reply and
              the emoji button, with no room for a third thing. */}
          <HypeStar
            entry={entry}
            mine={mine}
            onReacted={onReacted}
            hyped={hyped}
            onHyped={onHyped}
            className={`ml-auto h-8 w-8 ${hyped ? "bg-accent text-accent-ink" : "bg-black/20 text-white/80 hover:bg-black/30 hover:text-white"}`}
          />
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${first}'s page full-screen`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20 text-white/70 transition-colors hover:bg-black/30 hover:text-white"
          >
            <Maximize2 size={13} />
          </button>
        </header>

        {bleed ? (
          /* The words sit straight on the photo, and they are the only
             thing on it. The song's banner is gone from a photo page
             altogether: the CD tucked behind the card already says there is
             one, plays it, and names it when tapped — the banner was a second
             label for the same song, and it was sitting on someone's face. */
          entry.text && (
            <div onClick={onOpen} className="pointer-events-auto mt-auto flex cursor-pointer flex-col items-start">
              <PageCaption
                text={entry.text}
                className="font-extrabold leading-[1.12] tracking-[-0.02em] text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.55)]"
                style={{ fontSize: lineSize(entry.text) }}
              />
            </div>
          )
        ) : entry.imageUrl ? (
          <>
            {/* In the list the card grows to fit: the photo, then the words. */}
            <button
              type="button"
              onClick={onOpen}
              aria-label="Open this page"
              className="mt-2 block w-full"
            >
              <PagePhoto url={entry.imageUrl} />
            </button>
            {entry.text && (
              <p
                onClick={onOpen}
                className="my-2 cursor-pointer break-words font-extrabold leading-[1.06] tracking-[-0.02em] text-white line-clamp-2"
                style={{ fontSize: fillSize(entry.text, 150) }}
              >
                {entry.text}
              </p>
            )}
          </>
        ) : (
          /* The words, in the middle of what is left. */
          <div className="flex min-h-0 flex-1 flex-col justify-center py-2" onClick={onOpen}>
            <p
              className="cursor-pointer break-words font-extrabold leading-[1.06] tracking-[-0.02em] text-white"
              // As big as the card can take: "HDB" fills it, a sentence fits.
              style={{ fontSize: fillSize(entry.text, big ? 250 : 280) }}
            >
              {entry.text}
            </p>
          </div>
        )}

        {!bleed && entry.track && <SongLine track={entry.track} />}
      </div>

      <div className="relative">
        <DiaryResponder
          entry={entry}
          mine={mine}
          onReacted={onReacted}
          hyped={hyped}
          onHyped={onHyped}
          target={() => avatar.current}
          stage={() => card.current}
        />
      </div>

      <span
        aria-hidden
        className="absolute bottom-0 left-0 z-10 h-[3px] rounded-r-full"
        style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: theme.burn }}
        suppressHydrationWarning
      />
    </article>
  );
}
