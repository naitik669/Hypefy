"use client";

import { Music, PenLine, Plus, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { diaryTheme, lifeLeft, noteSize, shortLeft } from "@/components/diary/DiaryPage";
import { reactionSummary, type DiaryEntry, type DiaryReaction } from "@/lib/diary";

/**
 * One Diary in the grid under the spotlight — the whole page at a glance:
 * the song's name, the words as large as they fit, who wrote it and how long
 * it has left. Tapping it opens it full-screen, where you can react and reply.
 */
export function DiaryTile({
  entry,
  label,
  fresh = false,
  onOpen,
  reactions,
}: {
  entry: DiaryEntry;
  /** Who signs it — their name, or "You". */
  label: string;
  fresh?: boolean;
  onOpen: () => void;
  /** On your own tile: what people sent, as a small tally. */
  reactions?: DiaryReaction[];
}) {
  const theme = diaryTheme(entry.color, entry.hue);
  const { size, clamp } = noteSize(entry.text);
  const tally = reactions ? reactionSummary(reactions).slice(0, 2) : [];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={entry.isSelf ? "Your Diary" : `${entry.name}'s Diary`}
      className="relative flex aspect-[4/5] flex-col overflow-hidden rounded-[24px] p-3.5 text-left transition-transform active:scale-[0.97]"
      style={{ background: theme.background, boxShadow: theme.shadow }}
    >
      <span className="flex min-h-5 items-center gap-1.5">
        {entry.track && (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/30 py-0.5 pl-1 pr-2 text-[10.5px] font-semibold text-white/85">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#111]">
              <Music size={8} />
            </span>
            <span className="truncate">{entry.track.title}</span>
          </span>
        )}
        {entry.isSelf && (
          <span className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/30 text-white/80">
            <PenLine size={11} />
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

      <span className="mt-3 flex min-w-0 items-center gap-1.5">
        <Avatar name={entry.name} hue={entry.hue} size={20} src={entry.avatarUrl ?? undefined} />
        <span className="truncate text-xs font-semibold text-white/90">{label}</span>
        {entry.audience === "close" && <Star size={10} className="shrink-0 fill-accent text-accent" aria-label="Close friends" />}
        {fresh && <span aria-label="New" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
        {tally.length > 0 ? (
          <span className="ml-auto shrink-0 text-[11px] font-bold tabular-nums text-white/85">
            {tally.map((t) => `${t.emoji}${t.count}`).join(" ")}
          </span>
        ) : (
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
  );
}

/** Your tile when you have not written a Diary today: a blank page to start one. */
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
      className="relative flex aspect-[4/5] flex-col overflow-hidden rounded-[24px] bg-white/[0.04] p-3.5 text-left transition-colors hover:bg-white/[0.07] active:scale-[0.97]"
      style={{ boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / 0.1)" }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink">
        <Plus size={18} strokeWidth={2.8} />
      </span>
      <span className="mt-auto text-[20px] font-extrabold leading-[1.1] tracking-[-0.02em] text-white/85">
        Leave your Diary
      </span>
      <span className="mt-3 flex items-center gap-1.5">
        <Avatar name={me.name} hue={me.hue} size={20} src={me.avatarUrl ?? undefined} />
        <span className="text-xs font-semibold text-white/70">You · lasts 24h</span>
      </span>
    </button>
  );
}
