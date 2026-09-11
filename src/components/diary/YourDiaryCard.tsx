"use client";

import { useState } from "react";
import { Palette, PenLine, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SquircleSwatch } from "@/components/ui/SquircleSwatch";
import { DiscSleeve, SongLine } from "@/components/diary/DiaryDisc";
import { DIARY_COLORS, colorKey, diaryTheme, fillSize, lifeLeft, swatchOf, timeAgo, type DiaryColor } from "@/components/diary/DiaryPage";
import { ReactionsTab, byPerson } from "@/components/diary/PageReactions";
import type { DiaryEntry, DiaryReaction } from "@/lib/diary";

/**
 * Your page, as your circle sees it. If anyone reacted or hyped it, a small
 * tab at its foot shows their faces and emoji; tap it for who sent what.
 * If nobody has, there is nothing there at all.
 *
 * The palette in its corner recolours it on the spot — same words, same 24
 * hours, same reactions; only the colour changes.
 */
export function YourDiaryCard({
  entry,
  reactions,
  onEdit,
  onColor,
}: {
  entry: DiaryEntry;
  reactions: DiaryReaction[];
  onEdit: () => void;
  /** Recolour this page without rewriting it. */
  onColor?: (color: DiaryColor) => void;
}) {
  const [showWho, setShowWho] = useState(false);
  const [picking, setPicking] = useState(false);
  const current = colorKey(entry.color);
  const tint = diaryTheme(entry.color, entry.hue);

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
            {timeAgo(entry.createdAt)}
          </span>
          {onColor && (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              aria-label="Page colour"
              aria-expanded={picking}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                picking ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Palette size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit your page"
            className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <PenLine size={15} />
          </button>
        </header>

        {picking && onColor && (
          <div role="radiogroup" aria-label="Page colour" className="-mx-0.5 mt-3 flex items-center justify-between px-0.5 py-1">
            {DIARY_COLORS.map((c) => (
              <SquircleSwatch
                key={c.key}
                label={c.label}
                selected={current === c.key}
                background={swatchOf(c.key, entry.hue)}
                onClick={() => onColor(c.key)}
                size={30}
              />
            ))}
          </div>
        )}

        <p
          className="mt-3 break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
          style={{ fontSize: fillSize(entry.text, 280) }}
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
                {byPerson(reactions).map((p) => (
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
