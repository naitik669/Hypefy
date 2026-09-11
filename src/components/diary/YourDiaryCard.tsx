"use client";

import { useState } from "react";
import { PenLine, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DiscSleeve, SongLine } from "@/components/diary/DiaryDisc";
import { diaryTheme, lifeLeft, noteSize, shortLeft } from "@/components/diary/DiaryPage";
import { ReactionsTab } from "@/components/diary/PageReactions";
import type { DiaryEntry, DiaryReaction } from "@/lib/diary";

/**
 * Your page, as your circle sees it. If anyone reacted or hyped it, a small
 * tab at its foot shows their faces and emoji; tap it for who sent what.
 * If nobody has, there is nothing there at all.
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
  const [showWho, setShowWho] = useState(false);
  const tint = diaryTheme(entry.color, entry.hue);
  const { size } = noteSize(entry.text);

  // One row per person, with all they sent.
  const people = new Map<string, DiaryReaction & { sent: string[] }>();
  for (const r of reactions) {
    const p = people.get(r.userId);
    if (p) p.sent.push(r.emoji);
    else people.set(r.userId, { ...r, sent: [r.emoji] });
  }

  return (
    <DiscSleeve track={entry.track}>
      <article
        className="relative overflow-hidden rounded-[28px] p-4"
        style={{ background: tint.background, boxShadow: tint.shadow }}
      >
        <header className="flex items-center gap-2">
          <Avatar name={entry.name} hue={entry.hue} size={32} src={entry.avatarUrl ?? undefined} />
          <span className="text-sm font-bold text-white">You</span>
          {entry.audience === "close" && <Star size={12} className="fill-accent text-accent" aria-label="Close friends" />}
          <span className="ml-auto text-xs tabular-nums text-white/45" suppressHydrationWarning>
            {shortLeft(entry.createdAt)}
          </span>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit your page"
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

        {reactions.length > 0 && (
          <div className="mt-3">
            <ReactionsTab reactions={reactions} onOpen={() => setShowWho((v) => !v)} />
            {showWho && (
              <ul className="mt-2 flex flex-col gap-1.5 rounded-2xl bg-black/25 p-2.5">
                {[...people.values()].map((p) => (
                  <li key={p.userId} className="flex items-center gap-2">
                    <Avatar name={p.name} hue={p.hue} size={22} src={p.avatarUrl ?? undefined} />
                    <span className="truncate text-[13px] font-semibold text-white/90">{p.name}</span>
                    <span className="ml-auto text-base">{p.sent.join(" ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] rounded-r-full"
          style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: tint.burn }}
          suppressHydrationWarning
        />
      </article>
    </DiscSleeve>
  );
}
