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
 * deck — as tall as the screen allows, within reason: the spotlight sets
 * --card-h from the height it has; 356px wherever it does not.
 */
export const CARD_H = "var(--card-h, 356px)";

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
      className={`relative flex flex-col overflow-hidden rounded-[28px] px-4 pb-3 pt-3.5 ${big ? "" : "gap-3"}`}
      style={{ height: big ? CARD_H : undefined, background: theme.background, boxShadow: theme.shadow }}
    >
      <header className="flex items-center gap-2">
        <Link href={entry.username ? `/u/${entry.username}` : "#"} className="flex min-w-0 items-center gap-2">
          <span ref={avatar} className="shrink-0 rounded-full">
            <Avatar name={entry.name} hue={entry.hue} size={32} src={entry.avatarUrl ?? undefined} />
          </span>
          <span className="truncate text-sm font-bold text-white">{entry.name}</span>
        </Link>
        {entry.audience === "close" && (
          <Star size={12} className="shrink-0 fill-accent text-accent" aria-label="Close friends" />
        )}
        {fresh && <span aria-label="New" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
        <span className="ml-auto shrink-0 text-xs tabular-nums text-white/55" suppressHydrationWarning>
          {shortLeft(entry.createdAt)}
        </span>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${first}'s page full-screen`}
          className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Maximize2 size={14} />
        </button>
      </header>

      {/* The words, in the middle of what is left. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center" onClick={onOpen}>
        <p
          className="cursor-pointer break-words font-extrabold leading-[1.06] tracking-[-0.02em] text-white"
          style={{ fontSize: big ? Math.min(Math.round(size * 1.3), 56) : Math.min(Math.round(size * 1.05), 44) }}
        >
          {entry.text}
        </p>
      </div>

      {entry.track && (
        <div className="-mb-0.5">
          <SongLine track={entry.track} />
        </div>
      )}

      <div className="mt-1.5">
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
        className="absolute bottom-0 left-0 h-[3px] rounded-r-full"
        style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: theme.burn }}
        suppressHydrationWarning
      />
    </article>
  );
}
