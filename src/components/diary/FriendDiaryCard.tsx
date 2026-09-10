"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Maximize2, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Plane } from "@/components/ui/Plane";
import { TrackChip } from "@/components/music/TrackChip";
import { lifeLeft, noteSize, pageTint, shortLeft } from "@/components/diary/DiaryPage";
import { QUICK_EMOJIS, useDiaryActions } from "@/components/diary/useDiaryActions";
import type { DiaryEntry } from "@/lib/diary";

/**
 * One friend's Diary in the list — everything on it readable, and everything
 * you can do with it doable, without opening anything.
 *
 * The note is shown whole, never clamped: the database caps a Diary at 60
 * characters, which always fits a full-width card, so there is no "more" to
 * hide. The song plays from here. The reactions are six buttons on the card,
 * with yours already picked. Reply opens a field in the card itself.
 *
 * Opening full-screen (the corner button, or the note) is still there for
 * swiping through everyone — as an extra, not a step.
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
  const { react, reply, status, error, resetStatus } = useDiaryActions({ entry, mine, onReacted });
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const tint = pageTint(entry.hue);
  const { size } = noteSize(entry.text);
  const first = entry.name.split(" ")[0];

  return (
    <article
      className="relative overflow-hidden rounded-[28px] border p-4"
      style={{ background: tint.background, borderColor: tint.borderColor }}
    >
      {/* Who, and how long is left. */}
      <header className="flex items-center gap-2">
        <Link
          href={entry.username ? `/u/${entry.username}` : "#"}
          className="flex min-w-0 items-center gap-2"
        >
          <Avatar name={entry.name} hue={entry.hue} size={34} src={entry.avatarUrl ?? undefined} />
          <span className="truncate text-sm font-bold text-white">{entry.name}</span>
        </Link>
        {entry.audience === "close" && (
          <Star size={12} className="shrink-0 fill-accent text-accent" aria-label="Close friends" />
        )}
        {fresh && <span aria-label="New" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
        <span className="ml-auto shrink-0 text-xs tabular-nums text-white/50" suppressHydrationWarning>
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

      {/* The note, whole. */}
      <p
        onClick={onOpen}
        className="mt-3 cursor-pointer break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
        style={{ fontSize: Math.min(Math.round(size * 1.15), 50) }}
      >
        {entry.text}
      </p>

      {entry.track && <TrackChip track={entry.track} className="mt-3 w-full" />}

      {/* React and reply, right here. */}
      <div className="mt-3 flex items-center gap-1">
        <div className="flex flex-1 items-center justify-between rounded-pill bg-black/30 p-0.5">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              aria-label={`React ${e}`}
              aria-pressed={mine === e}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-[18px] transition-transform active:scale-90 ${
                mine === e ? "scale-110 bg-accent/20 ring-2 ring-accent" : "hover:bg-white/10"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setReplying((v) => !v);
            resetStatus();
          }}
          aria-label={`Reply to ${first}`}
          aria-expanded={replying}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            replying ? "bg-accent text-accent-ink" : "bg-black/30 text-white/85 hover:bg-white/10"
          }`}
        >
          <Plane size={17} />
        </button>
      </div>

      {replying && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await reply(draft)) setDraft("");
          }}
          className="mt-2 flex items-center gap-2 rounded-pill border border-white/10 bg-black/35 py-1 pl-4 pr-1"
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (status !== "sending") resetStatus();
            }}
            placeholder={`Reply to ${first}…`}
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-white/40"
          />
          <button
            type="submit"
            disabled={!draft.trim() || status === "sending"}
            aria-label="Send reply"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
          >
            {status === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Plane size={15} />}
          </button>
        </form>
      )}
      {status === "sent" && (
        <p className="mt-2 text-xs font-semibold text-accent">Sent to your DMs with {first}</p>
      )}
      {status === "error" && error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[3px] rounded-r-full opacity-80"
        style={{ width: `${lifeLeft(entry.createdAt) * 100}%`, background: tint.burn }}
        suppressHydrationWarning
      />
    </article>
  );
}
