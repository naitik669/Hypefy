"use client";

import { useRef } from "react";
import Link from "next/link";
import { Maximize2, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DiscSleeve, SongLine } from "@/components/diary/DiaryDisc";
import { DiaryResponder } from "@/components/diary/DiaryResponder";
import { lifeLeft, noteSize, pageTint, shortLeft } from "@/components/diary/DiaryPage";
import type { DiaryEntry } from "@/lib/diary";

/**
 * One friend's Diary in the list — everything on it readable, and everything
 * you can do with it doable, without opening anything.
 *
 * The note is shown whole, never clamped: the database caps a Diary at 60
 * characters, which always fits, so there is no "more" to hide. A song is a
 * CD tucked behind the page; tap it to play. The six emoji and the reply
 * field sit under the note at rest, and both go to your DMs with them.
 *
 * Opening full-screen (the corner button, or the note) is there for swiping
 * through everyone — as an extra, not a step.
 */
export function FriendDiaryCard({
  entry,
  fresh,
  mine,
  onReacted,
  onOpen,
}: {
  entry: DiaryEntry;
  fresh: boolean;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  onOpen: () => void;
}) {
  const avatar = useRef<HTMLSpanElement>(null);
  const tint = pageTint(entry.hue);
  const { size } = noteSize(entry.text);
  const first = entry.name.split(" ")[0];

  return (
    <DiscSleeve track={entry.track}>
      <article
        className="relative overflow-hidden rounded-[28px] px-4 pb-2 pt-3.5"
        style={{ background: tint.background, boxShadow: tint.shadow }}
      >
        <header className="flex items-center gap-2">
          <Link
            href={entry.username ? `/u/${entry.username}` : "#"}
            className="flex min-w-0 items-center gap-2"
          >
            <span ref={avatar} className="shrink-0 rounded-full">
              <Avatar name={entry.name} hue={entry.hue} size={32} src={entry.avatarUrl ?? undefined} />
            </span>
            <span className="truncate text-sm font-bold text-white">{entry.name}</span>
          </Link>
          {entry.audience === "close" && (
            <Star size={12} className="shrink-0 fill-accent text-accent" aria-label="Close friends" />
          )}
          {fresh && <span aria-label="New" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
          <span className="ml-auto shrink-0 text-xs tabular-nums text-white/45" suppressHydrationWarning>
            {shortLeft(entry.createdAt)} left
          </span>
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${first}'s Diary full-screen`}
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
          >
            <Maximize2 size={14} />
          </button>
        </header>

        <p
          onClick={onOpen}
          className="mt-3 cursor-pointer break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
          style={{ fontSize: Math.min(Math.round(size * 1.1), 48) }}
        >
          {entry.text}
        </p>

        {entry.track && (
          <div className="mt-2">
            <SongLine track={entry.track} />
          </div>
        )}

        <div className="mt-3">
          <DiaryResponder entry={entry} mine={mine} onReacted={onReacted} target={() => avatar.current} />
        </div>

        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[2px] rounded-r-full opacity-90"
          style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: tint.burn }}
          suppressHydrationWarning
        />
      </article>
    </DiscSleeve>
  );
}
