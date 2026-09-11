"use client";

import { useRef } from "react";
import Link from "next/link";
import { Maximize2, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SongLine } from "@/components/diary/DiaryDisc";
import { DiaryResponder } from "@/components/diary/DiaryResponder";
import { diaryTheme, lifeLeft, noteSize, shortLeft } from "@/components/diary/DiaryPage";
import type { DiaryEntry } from "@/lib/diary";

/**
 * Every card in the spotlight is the same height, so they sit square as a
 * deck — a rectangle a little taller than it is wide, sized to the screen
 * by the spotlight (--card-h); 340px wherever that is not set.
 */
export const CARD_H = "var(--card-h, 340px)";

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
  const { size } = noteSize(entry.text);
  const big = shape === "spotlight";
  const first = entry.name.split(" ")[0];

  return (
    <article
      ref={card}
      inert={inert}
      aria-hidden={inert || undefined}
      className="relative flex flex-col overflow-hidden rounded-[28px]"
      style={{ height: big ? CARD_H : undefined, background: theme.background, boxShadow: theme.shadow }}
    >
      <div className={`flex min-h-0 flex-1 flex-col px-4 pt-3.5 ${big ? "pb-2.5" : "gap-3 pb-3"}`}>
        {/* Who, and how long it has left — one block on the left; opening it
            full-screen on the right. */}
        <header className="flex items-center gap-2.5">
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
                {shortLeft(entry.createdAt)}
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${first}'s page full-screen`}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20 text-white/70 transition-colors hover:bg-black/30 hover:text-white"
          >
            <Maximize2 size={13} />
          </button>
        </header>

        {/* The words, in the middle of what is left. */}
        <div className="flex min-h-0 flex-1 flex-col justify-center py-2" onClick={onOpen}>
          <p
            className="cursor-pointer break-words font-extrabold leading-[1.06] tracking-[-0.02em] text-white"
            style={{ fontSize: big ? Math.min(Math.round(size * 1.15), 46) : Math.min(Math.round(size * 1.05), 44) }}
          >
            {entry.text}
          </p>
        </div>

        {entry.track && <SongLine track={entry.track} />}
      </div>

      <DiaryResponder
        entry={entry}
        mine={mine}
        onReacted={onReacted}
        hyped={hyped}
        onHyped={onHyped}
        target={() => avatar.current}
        stage={() => card.current}
      />

      <span
        aria-hidden
        className="absolute bottom-0 left-0 z-10 h-[3px] rounded-r-full"
        style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: theme.burn }}
        suppressHydrationWarning
      />
    </article>
  );
}
