"use client";

import { Music, Plus, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { diaryTheme, lifeLeft, noteSize, shortLeft } from "@/components/diary/DiaryPage";
import { FloatingReactions, ReactionsTab } from "@/components/diary/PageReactions";
import type { DiaryEntry, DiaryReaction } from "@/lib/diary";

/**
 * One page in the grid under the spotlight — at a glance: the song, the
 * words as large as they fit, who wrote it and how long it has left. Tapping
 * it opens it full-screen (or, for yours, opens it to edit).
 *
 * On yours, reactions float up over it when new ones have come in, and a tab
 * at its foot opens who sent what.
 */
export function DiaryTile({
  entry,
  label,
  fresh = false,
  onOpen,
  reactions = [],
  flying = [],
  onReactions,
}: {
  entry: DiaryEntry;
  /** Who signs it — their name, or "You". */
  label: string;
  fresh?: boolean;
  onOpen: () => void;
  /** Yours only: everything people sent, for the tab. */
  reactions?: DiaryReaction[];
  /** Yours only: what has come in since you last looked, to float up. */
  flying?: DiaryReaction[];
  onReactions?: () => void;
}) {
  const theme = diaryTheme(entry.color, entry.hue);
  const { size, clamp } = noteSize(entry.text);
  const hasTab = entry.isSelf && reactions.length > 0 && onReactions;

  return (
    <div className="relative aspect-[4/5]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={entry.isSelf ? "Your page" : `${entry.name}'s page`}
        className="relative flex h-full w-full flex-col overflow-hidden rounded-[24px] p-3.5 text-left transition-transform active:scale-[0.97]"
        style={{ background: theme.background, boxShadow: theme.shadow }}
      >
        <span className="flex min-h-5 items-center">
          {entry.track && (
            <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/30 py-0.5 pl-1 pr-2 text-[10.5px] font-semibold text-white/85">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#111]">
                <Music size={8} />
              </span>
              <span className="truncate">{entry.track.title}</span>
            </span>
          )}
        </span>

        <span
          className="mt-auto break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
          style={{
            fontSize: Math.min(size, 36),
            display: "-webkit-box",
            WebkitLineClamp: clamp,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {entry.text}
        </span>

        <span className="mt-3 flex min-h-6 min-w-0 items-center gap-1.5">
          <Avatar name={entry.name} hue={entry.hue} size={20} src={entry.avatarUrl ?? undefined} />
          {/* On yours, the reactions tab takes the name's place. */}
          {!hasTab && <span className="truncate text-xs font-semibold text-white/90">{label}</span>}
          {entry.audience === "close" && (
            <Star size={10} className="shrink-0 fill-accent text-accent" aria-label="Close friends" />
          )}
          {fresh && <span aria-label="New" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
          {!hasTab && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-white/50" suppressHydrationWarning>
              {shortLeft(entry.createdAt)}
            </span>
          )}
        </span>

        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] rounded-r-full"
          style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: theme.burn }}
          suppressHydrationWarning
        />
      </button>

      {entry.isSelf && <FloatingReactions reactions={flying} />}
      {hasTab && <ReactionsTab reactions={reactions} onOpen={onReactions} className="absolute bottom-3 left-[40px] z-30" />}
    </div>
  );
}

/** Your tile when you have not written a page today: a plus, to start one. */
export function WriteTile({
  me,
  onWrite,
}: {
  me: { name: string; hue: number; avatarUrl: string | null };
  onWrite: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onWrite}
      aria-label="New page"
      className="relative flex aspect-[4/5] flex-col items-center justify-center gap-3 overflow-hidden rounded-[24px] bg-white/[0.04] transition-colors hover:bg-white/[0.07] active:scale-[0.97]"
      style={{ boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / 0.1)" }}
    >
      <span className="relative">
        <Avatar name={me.name} hue={me.hue} size={52} src={me.avatarUrl ?? undefined} />
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink ring-[3px] ring-background">
          <Plus size={14} strokeWidth={3} />
        </span>
      </span>
      <span className="text-sm font-bold text-white/80">New page</span>
    </button>
  );
}
