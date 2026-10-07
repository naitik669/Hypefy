"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { noteNudgeDismissed, nudgeLine, readSpotlightUse, shouldNudge } from "@/lib/spotlight-nudge";

/** The faces drawn on the little deck, at most. */
const FACES = 3;

export type NudgePage = { userId: string; name: string; avatarUrl: string | null; hue: number };

/**
 * A reminder, at the top of Messages, that Spotlight is there.
 *
 * Drawn as what it is: a small fan of pages with the faces of whoever wrote
 * today, and one line about what is waiting. Shown only to people who have
 * not been using Spotlight, and less often each time it is waved away: see
 * lib/spotlight-nudge. Opening Spotlight by any route stops it.
 */
export function SpotlightNudge({ others, hasOwn }: { others: NudgePage[]; hasOwn: boolean }) {
  // Decided after mount: it reads this device, which the server cannot.
  const [show, setShow] = useState(false);
  useEffect(() => {
    const due = shouldNudge(readSpotlightUse(), Date.now());
    const t = setTimeout(() => setShow(due), 0);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const line = nudgeLine(others.length, hasOwn);
  const fan = others.slice(0, FACES);

  return (
    <div data-spotlight-nudge className="mx-4 mb-2 mt-1 flex items-center gap-3 rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-1.5">
      <Link href="/messages/spotlight" className="flex min-w-0 flex-1 items-center gap-3">
        {/* The deck: pages fanned like the real one, newest on top. */}
        <span aria-hidden className="relative h-11 w-12 shrink-0">
          {(fan.length ? fan : [null]).map((p, i, all) => {
            const back = all.length - 1 - i;
            return (
              <span
                key={p?.userId ?? "empty"}
                className="absolute bottom-0 left-1.5 flex h-10 w-8 items-center justify-center overflow-hidden rounded-lg border border-white/15 text-[13px] font-extrabold text-white"
                style={{
                  background: p ? `hsl(${p.hue} 55% 38%)` : "hsl(80 60% 30%)",
                  transform: `rotate(${(back - (all.length - 1) / 2) * 9}deg) translateX(${back * 4}px)`,
                  zIndex: i,
                }}
              >
                {p?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (p?.name ?? "+").slice(0, 1).toUpperCase()
                )}
              </span>
            );
          })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{line.title}</span>
          <span className="block truncate text-xs text-muted">{line.text}</span>
        </span>
        <span className="shrink-0 rounded-xl bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink">{line.cta}</span>
      </Link>
      <button
        type="button"
        onClick={() => {
          noteNudgeDismissed();
          setShow(false);
        }}
        aria-label="Not now"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:text-foreground"
      >
        <X size={15} />
      </button>
    </div>
  );
}
