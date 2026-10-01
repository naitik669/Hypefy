"use client";

import { useState } from "react";
import { PagePhoto } from "@/components/diary/PagePhoto";
import Link from "next/link";
import { Palette, PenLine, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ColorPager } from "@/components/ui/ColorPager";
import { DiscSleeve, SongLine } from "@/components/diary/DiaryDisc";
import { colorKey, diaryTheme, fillSize, lifeLeft, pageColorGroups, timeAgo, type DiaryColor } from "@/components/diary/DiaryPage";
import { ReactionsTab, byPerson } from "@/components/diary/PageReactions";
import { reactionSummary, type DiaryEntry, type DiaryReaction } from "@/lib/diary";

/**
 * Your page, as your circle sees it. If anyone reacted or hyped it, a strip
 * across its foot, ruled off from the page, says who and with what; tap it
 * for who sent what.
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
          <div className="mt-3">
            <ColorPager
              label="Page colour"
              groups={pageColorGroups(entry.hue)}
              value={current}
              onChange={(k) => onColor(k as DiaryColor)}
              size={30}
            />
          </div>
        )}

        {entry.imageUrl && <PagePhoto url={entry.imageUrl} className="mt-3" />}

        {entry.text && (
          <p
            className="mt-3 break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
            style={{ fontSize: fillSize(entry.text, entry.imageUrl ? 150 : 280) }}
          >
            {entry.text}
          </p>
        )}

        {entry.track && (
          <div className="mt-2">
            <SongLine track={entry.track} />
          </div>
        )}

        {reactions.length > 0 && (
          <div className="-mx-4 -mb-4 mt-4 border-t border-white/10 px-4 pb-4 pt-3">
            <ReactionsTab reactions={reactions} onOpen={() => setShowWho(true)} />
          </div>
        )}

        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] rounded-r-full"
          style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: tint.burn }}
          suppressHydrationWarning
        />
      </article>
      <ReactionsSheet open={showWho} onClose={() => setShowWho(false)} reactions={reactions} />
    </DiscSleeve>
  );
}

/**
 * Who reacted to your page, in a sheet over half the screen — the way
 * comments and sharing open — so the list has room and the page stays put.
 * The tally across the top, then one row per person with everything they
 * sent (an emoji, a hype, or both), newest first, each opening their profile.
 */
function ReactionsSheet({ open, onClose, reactions }: { open: boolean; onClose: () => void; reactions: DiaryReaction[] }) {
  const people = byPerson(reactions);
  const tally = reactionSummary(reactions);
  return (
    <BottomSheet open={open} onClose={onClose} title="Reactions">
      <div className="flex flex-col gap-3 pb-3">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {tally.map((t) => (
            <span key={t.emoji} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-sm font-bold tabular-nums">
              <span className="text-base leading-none">{t.emoji}</span>
              {t.count}
            </span>
          ))}
        </div>
        <ul className="flex flex-col">
          {people.map((p) => (
            <li key={p.userId}>
              <Link
                href={p.username ? `/u/${p.username}` : "#"}
                onClick={onClose}
                className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
              >
                <Avatar name={p.name} hue={p.hue} size={40} src={p.avatarUrl ?? undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{p.name}</span>
                  <span className="block text-xs text-muted" suppressHydrationWarning>
                    {p.username ? `@${p.username} · ` : ""}
                    {timeAgo(p.at)}
                  </span>
                </span>
                <span className="shrink-0 text-[22px] leading-none tracking-[0.1em]">{p.sent.join("")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}
