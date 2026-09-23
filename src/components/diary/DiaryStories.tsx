"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PagePhoto } from "@/components/diary/PagePhoto";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DiaryDisc, SongLine } from "@/components/diary/DiaryDisc";
import { DiaryResponder } from "@/components/diary/DiaryResponder";
import { diaryTheme, fillSize, timeAgo } from "@/components/diary/DiaryPage";
import { STORY_MS, stepStory, type DiaryEntry } from "@/lib/diary";

/** The CD: big, but never more than about a third of the screen's height. */
const DISC = "min(270px, 34dvh)";

/**
 * The words full-screen: a third larger than on a card, with the longest
 * word still fitting across the screen (about 330px of it).
 */
function screenSize(text: string): number {
  const scale = 1.3;
  return Math.min(150, Math.round(fillSize(text, 330 / scale) * scale));
}

/**
 * Pages full-screen, one after another — for when you want to go through
 * everyone's rather than scan the list. Never required: everything here is
 * also on the cards.
 *
 * The words are large, in the upper part of the screen; a page with a song
 * has its CD low on the right, big and half off the edge, turning while the
 * song plays, with the song's name under it.
 *
 * Gestures, in the order people reach for them: tap the right of the screen
 * for the next page and the left for the one before; swipe sideways for the
 * same; swipe down to leave; press and hold to stop the clock while you read.
 * Typing a reply stops it too — a page moving on under a half-written reply
 * is the worst thing this screen could do. Arrow keys and Escape work on a
 * keyboard.
 */
export function DiaryStories({
  list,
  start,
  onClose,
  myReactions,
  onReacted,
  hyped,
  onHyped,
}: {
  list: DiaryEntry[];
  start: number;
  onClose: () => void;
  myReactions: Record<string, string>;
  onReacted: (userId: string, emoji: string | null) => void;
  hyped: ReadonlySet<string>;
  onHyped: (userId: string, hyped: boolean) => void;
}) {
  const [index, setIndex] = useState(start);
  const [elapsed, setElapsed] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const entry = list[index];
  const avatar = useRef<HTMLSpanElement>(null);
  const page = useRef<HTMLDivElement>(null);

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
      aria-label={`${entry.name}'s page`}
      className="fixed inset-0 z-[80] mx-auto flex max-w-[480px] flex-col overflow-hidden text-white"
      style={{ background: diaryTheme(entry.color, entry.hue).screen }}
    >
      {/* Progress: one segment per Diary. */}
      <div className="flex gap-1 px-3 pt-[max(var(--sat),12px)]" aria-hidden>
        {list.map((d, i) => (
          <span key={d.userId} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
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
        <span ref={avatar} className="shrink-0 rounded-full">
          <Avatar name={entry.name} hue={entry.hue} size={32} src={entry.avatarUrl ?? undefined} />
        </span>
        <span className="truncate text-sm font-bold">{entry.name}</span>
        {entry.audience === "close" && <Star size={12} className="fill-accent text-accent" aria-label="Close friends" />}
        <span className="text-xs text-white/50" suppressHydrationWarning>
          · {timeAgo(entry.createdAt)}
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

      {/* The page — the part you tap, hold and swipe. The words, large, in
          its upper part; the CD low on the right, half off the edge, with
          the song's name under it. With no song the words sit in the middle. */}
      <div
        ref={page}
        className={`relative flex flex-1 touch-none select-none flex-col items-center px-7 text-center ${
          entry.track ? "justify-start pt-[7dvh]" : "justify-center"
        }`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          setHeld(false);
        }}
      >
        {entry.imageUrl && (
          <PagePhoto url={entry.imageUrl} className="mb-4 w-[min(78vw,420px)] rounded-3xl" />
        )}
        <p
          className="relative break-words font-extrabold leading-[1.04] tracking-[-0.025em]"
          style={{ fontSize: entry.imageUrl ? Math.min(screenSize(entry.text), 30) : screenSize(entry.text) }}
        >
          {entry.text}
        </p>
        {paused && held && <p className="mt-3 text-xs font-semibold text-white/55">Paused</p>}

        {entry.track && (
          // Its own tap target: a press on the disc or the song must not count
          // as a tap on the page, which would move on to the next page.
          <div
            className="absolute bottom-3 right-0 flex flex-col items-end"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="translate-x-[42%]">
              {/* Keyed per page so each one's song starts as it comes on screen. */}
              <DiaryDisc key={entry.userId} track={entry.track} size={DISC} slide={-28} autoPlay />
            </div>
            <div className="mr-5 mt-3 flex max-w-[78vw] justify-end">
              <SongLine track={entry.track} />
            </div>
          </div>
        )}
      </div>

      <div
        key={entry.userId}
        className="px-3 pb-[max(var(--sab),12px)]"
      >
        <DiaryResponder
          entry={entry}
          mine={myReactions[entry.userId] ?? null}
          onReacted={onReacted}
          hyped={hyped.has(entry.userId)}
          onHyped={onHyped}
          target={() => avatar.current}
          stage={() => page.current}
          onTyping={setTyping}
          size="screen"
        />
      </div>
    </div>,
    document.body
  );
}
