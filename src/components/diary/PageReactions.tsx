"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { reactionSummary, type DiaryReaction } from "@/lib/diary";

/**
 * Reactions floating up over your page — each one someone sent since you
 * last looked, two or three copies apiece, rising and swaying and fading.
 * It plays once and clears itself; nothing to read, just the news that
 * people reacted. Who sent what is one tap away, on the tab.
 */
export function FloatingReactions({ reactions }: { reactions: DiaryReaction[] }) {
  // Positions are random, so they are made after mount — never on the server,
  // where they would not match what the browser draws.
  const [bits, setBits] = useState<
    { key: string; emoji: string; left: number; size: number; style: React.CSSProperties }[]
  >([]);

  useEffect(() => {
    if (reactions.length === 0) return;
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
  }, [reactions]);

  if (bits.length === 0) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {bits.map((b) => (
        <span key={b.key} className="page-float" style={{ left: `${b.left}%`, fontSize: b.size, ...b.style }}>
          {b.emoji}
        </span>
      ))}
    </span>
  );
}

/** One row per person, with everything they sent (an emoji, a hype, or both). */
function byPerson(reactions: DiaryReaction[]) {
  const people = new Map<string, DiaryReaction & { sent: string[] }>();
  for (const r of reactions) {
    const p = people.get(r.userId);
    if (p) p.sent.push(r.emoji);
    else people.set(r.userId, { ...r, sent: [r.emoji] });
  }
  return [...people.values()];
}

/**
 * The tab on your page: the faces of the first few who reacted and the
 * emoji they sent. Nothing at all when nobody has — no "no reactions yet".
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
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`Reactions from ${people.length} ${people.length === 1 ? "person" : "people"}`}
      className={`flex items-center gap-1.5 rounded-full bg-black/35 py-1 pl-1 pr-2.5 text-[12px] font-bold text-white backdrop-blur-sm transition-colors hover:bg-black/50 ${className}`}
    >
      <span className="flex -space-x-1.5">
        {people.slice(0, 3).map((p) => (
          <span key={p.userId} className="rounded-full ring-2 ring-black/40">
            <Avatar name={p.name} hue={p.hue} size={20} src={p.avatarUrl ?? undefined} />
          </span>
        ))}
      </span>
      <span className="tabular-nums">{tally.map((t) => t.emoji).join("")}</span>
      <span className="tabular-nums text-white/70">{people.length}</span>
    </button>
  );
}

/** Who reacted to your page, and with what. */
export function ReactionsSheet({
  open,
  onClose,
  reactions,
}: {
  open: boolean;
  onClose: () => void;
  reactions: DiaryReaction[];
}) {
  const people = byPerson(reactions);
  return (
    <BottomSheet open={open} onClose={onClose} title="Reactions">
      <ul className="flex flex-col pb-4">
        {people.map((p) => (
          <li key={p.userId} className="flex h-12 items-center gap-3 px-1">
            <Avatar name={p.name} hue={p.hue} size={32} src={p.avatarUrl ?? undefined} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
            <span className="text-lg">{p.sent.join(" ")}</span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
