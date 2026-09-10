"use client";

import { useRef } from "react";
import Link from "next/link";
import { Maximize2, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SongLine } from "@/components/diary/DiaryDisc";
import { DiaryResponder } from "@/components/diary/DiaryResponder";
import { diaryTheme, lifeLeft, noteSize, shortLeft } from "@/components/diary/DiaryPage";
import type { DiaryEntry } from "@/lib/diary";

/** Every card in the stack is the same height, so they sit square as a deck. */
export const CARD_HEIGHT = 312;

/**
 * One friend's Diary as a card in the stack.
 *
 * The whole Diary is on it: the note in full (a Diary is at most 60
 * characters, which always fits), the song, six emoji and a reply arrow. The
 * cards behind the top one are drawn the same way but inert — you see their
 * colour and edges, and act on the one in front.
 */
export function FriendDiaryCard({
  entry,
  fresh,
  mine,
  onReacted,
  onOpen,
  inert = false,
}: {
  entry: DiaryEntry;
  fresh: boolean;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  onOpen: () => void;
  /** A card behind the top one: shown, not usable. */
  inert?: boolean;
}) {
  const avatar = useRef<HTMLSpanElement>(null);
  const theme = diaryTheme(entry.color, entry.hue);
  const { size } = noteSize(entry.text);
  const first = entry.name.split(" ")[0];

  return (
    <article
      inert={inert}
      aria-hidden={inert || undefined}
      className="relative flex flex-col overflow-hidden rounded-[28px] px-4 pb-3.5 pt-3.5"
      style={{ height: CARD_HEIGHT, background: theme.background, boxShadow: theme.shadow }}
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
          {shortLeft(entry.createdAt)} left
        </span>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${first}'s Diary full-screen`}
          className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Maximize2 size={14} />
        </button>
      </header>

      {/* The note, in the middle of the page. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center py-2" onClick={onOpen}>
        <p
          className="cursor-pointer break-words font-extrabold leading-[1.06] tracking-[-0.02em] text-white"
          style={{ fontSize: Math.min(Math.round(size * 1.08), 46) }}
        >
          {entry.text}
        </p>
      </div>

      {entry.track && (
        <div className="-mb-0.5">
          <SongLine track={entry.track} />
        </div>
      )}

      <div className="mt-2">
        <DiaryResponder entry={entry} mine={mine} onReacted={onReacted} target={() => avatar.current} />
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
