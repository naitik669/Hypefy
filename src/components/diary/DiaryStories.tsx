"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Star, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Plane } from "@/components/ui/Plane";
import { TrackChip } from "@/components/music/TrackChip";
import { noteSize, pageTint, shortLeft } from "@/components/diary/DiaryPage";
import { QUICK_EMOJIS, useDiaryActions } from "@/components/diary/useDiaryActions";
import { STORY_MS, stepStory, type DiaryEntry } from "@/lib/diary";

/**
 * Diaries full-screen, one after another — for when you want to go through
 * everyone's rather than scan the list. Never required: everything here is
 * also on the cards.
 *
 * Gestures, in the order people reach for them: tap the right of the screen
 * for the next Diary and the left for the one before; swipe sideways for the
 * same; swipe down to leave; press and hold to stop the clock while you read.
 * Typing a reply stops it too — a Diary moving on under a half-written reply
 * is the worst thing this screen could do. Arrow keys and Escape work on a
 * keyboard.
 */
export function DiaryStories({
  list,
  start,
  onClose,
  myReactions,
  onReacted,
}: {
  list: DiaryEntry[];
  start: number;
  onClose: () => void;
  myReactions: Record<string, string>;
  onReacted: (userId: string, emoji: string | null) => void;
}) {
  const [index, setIndex] = useState(start);
  const [elapsed, setElapsed] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const entry = list[index];

  const elapsedRef = useRef(0);
  useLayoutEffect(() => {
    elapsedRef.current = elapsed;
  });

  const go = useCallback(
    (dir: 1 | -1) => {
      const next = stepStory(index, list.length, dir);
      if (next === null) {
        onClose();
        return;
      }
      setIndex(next);
      setElapsed(0);
    },
    [index, list.length, onClose]
  );

  // The clock. Resumes from where it stopped rather than from zero, so
  // holding to read does not buy a Diary a fresh six seconds.
  const paused = held || typing;
  useEffect(() => {
    if (paused || !entry) return;
    const began = performance.now() - elapsedRef.current;
    const id = window.setInterval(() => {
      const e = performance.now() - began;
      if (e >= STORY_MS) go(1);
      else setElapsed(e);
    }, 80);
    return () => window.clearInterval(id);
  }, [paused, entry, go]);

  // Keyboard, and no page scrolling underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose, typing]);

  // Tap, hold, and swipe on the page itself.
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setHeld(true);
  }
  function onPointerUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    setHeld(false);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const pressMs = performance.now() - p.t;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1);
    // A short, still press is a tap; a long one was a hold to read.
    if (pressMs < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      go(e.clientX - box.left < box.width / 3 ? -1 : 1);
    }
  }

  if (!entry || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.name}'s Diary`}
      className="fixed inset-0 z-[80] mx-auto flex max-w-[480px] flex-col text-white"
      style={{ background: pageTint(entry.hue).background }}
    >
      {/* Progress: one segment per Diary. */}
      <div className="flex gap-1 px-3 pt-[max(env(safe-area-inset-top),12px)]" aria-hidden>
        {list.map((d, i) => (
          <span key={d.userId} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <span
              className="block h-full rounded-full bg-white"
              style={{
                width: i < index ? "100%" : i > index ? "0%" : `${Math.min(100, (elapsed / STORY_MS) * 100)}%`,
              }}
            />
          </span>
        ))}
      </div>

      <header className="flex items-center gap-2 px-4 py-3">
        <Avatar name={entry.name} hue={entry.hue} size={32} src={entry.avatarUrl ?? undefined} />
        <span className="truncate text-sm font-bold">{entry.name}</span>
        {entry.audience === "close" && <Star size={12} className="fill-accent text-accent" aria-label="Close friends" />}
        <span className="text-xs text-white/55" suppressHydrationWarning>
          · {shortLeft(entry.createdAt)} left
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
        >
          <X size={20} />
        </button>
      </header>

      {/* The page — the part you tap, hold and swipe. */}
      <div
        className="flex flex-1 touch-none select-none flex-col justify-end px-6 pb-4"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          setHeld(false);
        }}
      >
        <p
          className="break-words font-extrabold leading-[1.04] tracking-[-0.025em]"
          style={{ fontSize: Math.min(Math.round(noteSize(entry.text).size * 1.5), 68) }}
        >
          {entry.text}
        </p>
        {paused && held && <p className="mt-3 text-xs font-semibold text-white/55">Paused</p>}
      </div>

      <StoryActions
        key={entry.userId}
        entry={entry}
        mine={myReactions[entry.userId] ?? null}
        onReacted={onReacted}
        onTyping={setTyping}
      />
    </div>,
    document.body
  );
}

/** Keyed per Diary, so a half-typed reply never carries over to the next. */
function StoryActions({
  entry,
  mine,
  onReacted,
  onTyping,
}: {
  entry: DiaryEntry;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  onTyping: (v: boolean) => void;
}) {
  const { react, reply, status, error } = useDiaryActions({ entry, mine, onReacted });
  const [draft, setDraft] = useState("");
  const first = entry.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-2 px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
      {entry.track && <TrackChip track={entry.track} autoPlayInView className="w-full" />}
      <div className="flex items-center justify-between rounded-pill border border-white/10 bg-black/35 p-1 backdrop-blur-sm">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => react(e)}
            aria-label={`React ${e}`}
            aria-pressed={mine === e}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-[20px] transition-transform active:scale-90 ${
              mine === e ? "scale-110 bg-accent/20 ring-2 ring-accent" : "hover:bg-white/10"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await reply(draft)) setDraft("");
        }}
        className="flex items-center gap-2 rounded-pill border border-white/10 bg-black/35 py-1 pl-4 pr-1 backdrop-blur-sm"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
          placeholder={`Reply to ${first}…`}
          maxLength={500}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-white/45"
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
      {status === "sent" && <p className="text-center text-xs font-semibold text-accent">Sent to your DMs with {first}</p>}
      {status === "error" && error && <p className="text-center text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
