"use client";

import { PenLine, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DiscSleeve, SongLine } from "@/components/diary/DiaryDisc";
import { diaryTheme, lifeLeft, noteSize, shortLeft } from "@/components/diary/DiaryPage";
import { reactionSummary, type DiaryEntry, type DiaryReaction } from "@/lib/diary";

/**
 * Your Diary, as your circle sees it, with what they did about it underneath
 * — the reactions are on the card, by name, not behind a tap.
 */
export function YourDiaryCard({
  entry,
  reactions,
  onEdit,
}: {
  entry: DiaryEntry;
  reactions: DiaryReaction[];
  onEdit: () => void;
}) {
  const tint = diaryTheme(entry.color, entry.hue);
  const { size } = noteSize(entry.text);
  const summary = reactionSummary(reactions);

  return (
    <DiscSleeve track={entry.track}>
      <article
        className="relative overflow-hidden rounded-[28px] p-4"
        style={{ background: tint.background, boxShadow: tint.shadow }}
      >
        <header className="flex items-center gap-2">
          <Avatar name={entry.name} hue={entry.hue} size={32} src={entry.avatarUrl ?? undefined} />
          <span className="text-sm font-bold text-white">Your Diary</span>
          {entry.audience === "close" && (
            <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
              <Star size={10} className="fill-accent" /> Close friends
            </span>
          )}
          <span className="ml-auto text-xs tabular-nums text-white/45" suppressHydrationWarning>
            {shortLeft(entry.createdAt)} left
          </span>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit your Diary"
            className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <PenLine size={15} />
          </button>
        </header>

        <p
          className="mt-3 break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
          style={{ fontSize: Math.min(Math.round(size * 1.1), 48) }}
        >
          {entry.text}
        </p>

        {entry.track && (
          <div className="mt-2">
            <SongLine track={entry.track} />
          </div>
        )}

        {/* Who reacted — the whole answer, on the card. */}
        <div className="mt-3 rounded-2xl bg-white/[0.05] p-3">
          {reactions.length === 0 ? (
            <p className="text-xs text-white/50">No reactions yet. They show up here as they come in.</p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold text-white/90">
                {summary.map((s) => (
                  <span key={s.emoji} className="tabular-nums">
                    {s.emoji} {s.count}
                  </span>
                ))}
                <span className="font-medium text-white/45">
                  · {reactions.length} {reactions.length === 1 ? "reaction" : "reactions"}
                </span>
              </p>
              <ul className="mt-2.5 flex flex-col gap-2">
                {reactions.map((r) => (
                  <li key={r.userId} className="flex items-center gap-2">
                    <Avatar name={r.name} hue={r.hue} size={22} src={r.avatarUrl ?? undefined} />
                    <span className="truncate text-[13px] font-semibold text-white/90">{r.name}</span>
                    <span className="ml-auto text-base">{r.emoji}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
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
