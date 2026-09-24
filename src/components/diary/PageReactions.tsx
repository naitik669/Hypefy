"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { reactionSummary, type DiaryReaction } from "@/lib/diary";

/**
 * Reactions floating up over your page — each one someone sent since you
 * last looked, two or three copies apiece, rising and swaying and fading.
 * It plays once and clears itself; nothing to read, just the news that
 * people reacted. Who sent what is one tap away, on the tab.
 *
 * It waits until your page is on screen — under the spotlight it usually
 * starts below the fold, and reactions nobody saw fly have not been shown.
 */
export function FloatingReactions({ reactions }: { reactions: DiaryReaction[] }) {
  // Positions are random, so they are made after mount — never on the server,
  // where they would not match what the browser draws.
  const [bits, setBits] = useState<
    { key: string; emoji: string; left: number; size: number; style: React.CSSProperties }[]
  >([]);
  const box = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (reactions.length === 0 || seen) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // No way to tell what is on screen: just play.
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reactions, seen]);

  useEffect(() => {
    if (reactions.length === 0 || !seen) return;
    const made = reactions.slice(0, 12).flatMap((r, i) =>
      Array.from({ length: reactions.length > 5 ? 2 : 3 }, (_, j) => {
        const n = i * 3 + j;
        return {
          key: `${r.userId}${r.emoji}${j}`,
          emoji: r.emoji,
          left: 14 + Math.random() * 72,
          size: 18 + Math.random() * 14,
          style: {
            "--sway": `${(Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 18)}px`,
            "--rise": `${120 + Math.random() * 80}px`,
            "--dur": `${1600 + Math.random() * 900}ms`,
            "--delay": `${n * 130 + Math.random() * 120}ms`,
          } as React.CSSProperties,
        };
      })
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- random positions exist only in the browser; see above
    setBits(made);
    const done = window.setTimeout(() => setBits([]), made.length * 130 + 3000);
    return () => window.clearTimeout(done);
  }, [reactions, seen]);

  if (reactions.length === 0) return null;
  return (
    <span ref={box} aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[28px]">
      {bits.map((b) => (
        <span key={b.key} className="page-float" style={{ left: `${b.left}%`, fontSize: b.size, ...b.style }}>
          {b.emoji}
        </span>
      ))}
    </span>
  );
}

/** One row per person, with everything they sent (an emoji, a hype, or both). */
export function byPerson(reactions: DiaryReaction[]) {
  const people = new Map<string, DiaryReaction & { sent: string[] }>();
  for (const r of reactions) {
    const p = people.get(r.userId);
    if (p) p.sent.push(r.emoji);
    else people.set(r.userId, { ...r, sent: [r.emoji] });
  }
  return [...people.values()];
}

/**
 * The strip at the foot of your page: the faces of the first few who
 * reacted, who they are in words — "Riya and 2 others" — and what they sent,
 * with an arrow to the full list. It reads as a line rather than a row of
 * tiny icons. Nothing at all when nobody has reacted — no "no reactions yet".
 */
export function ReactionsTab({
  reactions,
  onOpen,
  className = "",
}: {
  reactions: DiaryReaction[];
  onOpen: () => void;
  className?: string;
}) {
  if (reactions.length === 0) return null;
  const people = byPerson(reactions);
  const tally = reactionSummary(reactions).slice(0, 3);
  const lead = people[0].name.split(" ")[0];
  const others = people.length - 1;
  const who = others === 0 ? lead : `${lead} and ${others} other${others === 1 ? "" : "s"}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`Reactions from ${people.length} ${people.length === 1 ? "person" : "people"}`}
      className={`group flex w-full items-center gap-2.5 text-left ${className}`}
    >
      <span className="flex shrink-0">
        {people.slice(0, 3).map((p, i) => (
          <span key={p.userId} className={`rounded-[30%] ring-2 ring-black/25 ${i > 0 ? "-ml-2" : ""}`}>
            <Avatar name={p.name} hue={p.hue} size={28} src={p.avatarUrl ?? undefined} />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-bold text-white">{who}</span>
        <span className="mt-0.5 block truncate text-xs text-white/60">
          reacted{" "}
          {/* Full colour: the grey of "reacted" would wash the emoji out too. */}
          <span className="tracking-[0.15em] text-white">{tally.map((t) => t.emoji).join("")}</span>
        </span>
      </span>
      <ChevronRight
        size={17}
        aria-hidden
        className="shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70"
      />
    </button>
  );
}
