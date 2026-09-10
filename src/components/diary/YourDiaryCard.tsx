"use client";

import { PenLine, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { TrackChip } from "@/components/music/TrackChip";
import { lifeLeft, noteSize, pageTint, shortLeft } from "@/components/diary/DiaryPage";
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
  const tint = pageTint(entry.hue);
  const { size } = noteSize(entry.text);
  const summary = reactionSummary(reactions);

  return (
    <article
      className="relative overflow-hidden rounded-[28px] border p-4"
      style={{ background: tint.background, borderColor: tint.borderColor }}
    >
      <header className="flex items-center gap-2">
        <Avatar name={entry.name} hue={entry.hue} size={34} src={entry.avatarUrl ?? undefined} />
        <span className="text-sm font-bold text-white">Your Diary</span>
        {entry.audience === "close" && (
          <span className="flex items-center gap-1 rounded-pill bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
            <Star size={10} className="fill-accent" /> Close friends
          </span>
        )}
        <span className="ml-auto text-xs tabular-nums text-white/50" suppressHydrationWarning>
          {shortLeft(entry.createdAt)} left
        </span>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit your Diary"
          className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <PenLine size={15} />
        </button>
      </header>

      <p
        className="mt-3 break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
        style={{ fontSize: Math.min(Math.round(size * 1.15), 50) }}
      >
        {entry.text}
      </p>

      {entry.track && <TrackChip track={entry.track} className="mt-3 w-full" />}

      {/* Who reacted — the whole answer, on the card. */}
      <div className="mt-3 rounded-2xl bg-black/30 p-3">
        {reactions.length === 0 ? (
          <p className="text-xs text-white/55">No reactions yet. They show up here as they come in.</p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-xs font-bold text-white/90">
              {summary.map((s) => (
                <span key={s.emoji} className="tabular-nums">
                  {s.emoji} {s.count}
                </span>
              ))}
              <span className="font-medium text-white/50">
                · {reactions.length} {reactions.length === 1 ? "reaction" : "reactions"}
              </span>
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {reactions.map((r) => (
                <li key={r.userId} className="flex items-center gap-2">
                  <Avatar name={r.name} hue={r.hue} size={22} src={r.avatarUrl ?? undefined} />
                  <span className="truncate text-[13px] font-semibold text-white">{r.name}</span>
                  <span className="ml-auto text-base">{r.emoji}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[3px] rounded-r-full opacity-80"
        style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: tint.burn }}
        suppressHydrationWarning
      />
    </article>
  );
}
