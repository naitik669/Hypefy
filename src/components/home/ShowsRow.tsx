"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Show } from "@/lib/mock";

type CurrentUser = {
  name: string;
  hue: number;
  hasActiveShow: boolean; // whether the user already has an unexpired show
};

/**
 * Horizontal Shows row.
 *
 * - "Your Show" shows the signed-in user's own avatar (not just a "+" icon).
 *   If they have an active show the bubble gets the same green ring so they
 *   know one exists; always has a small "+" badge to add a new one.
 *
 * - Unseen shows from friends get a bright green (accent) stroke.
 *   After tapping, the stroke turns grey locally so it's clear you've seen it.
 *   Proper server-side seen tracking can replace this later.
 */
export function ShowsRow({
  shows,
  currentUser,
}: {
  shows: Show[];
  currentUser?: CurrentUser;
}) {
  const router = useRouter();
  // Track locally which shows the user has tapped this session
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  function handleShowTap(id: string) {
    setSeenIds((prev) => new Set([...prev, id]));
    router.push(`/shows/${id}`);
  }

  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-4">

      {/* ── Your Show ──────────────────────────────────────── */}
      <Link
        href="/shows/add"
        className="flex w-16 shrink-0 flex-col items-center gap-1.5"
      >
        <div className="relative">
          {currentUser ? (
            /* Show the user's own avatar */
            <div
              className={`rounded-[22px] p-[2.5px] ${
                currentUser.hasActiveShow ? "bg-accent" : "bg-border"
              }`}
            >
              <div className="rounded-[20px] bg-background p-[2px]">
                <Avatar
                  name={currentUser.name}
                  hue={currentUser.hue}
                  size={56}
                  className="rounded-[18px]"
                />
              </div>
            </div>
          ) : (
            /* Fallback: no profile loaded yet */
            <div className="flex h-[62px] w-[62px] items-center justify-center rounded-[20px] border-2 border-dashed border-border bg-surface">
              <Plus size={22} className="text-muted" strokeWidth={2.4} />
            </div>
          )}

          {/* Always show the "+" add badge */}
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink ring-4 ring-background">
            <Plus size={14} strokeWidth={3} />
          </span>
        </div>
        <span className="max-w-full truncate text-xs text-muted">Your Show</span>
      </Link>

      {/* ── Friends' shows ─────────────────────────────────── */}
      {shows.map((s) => {
        const seen = seenIds.has(s.id) || s.seen;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => handleShowTap(s.id)}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 active:opacity-75"
          >
            <div
              className={`rounded-[22px] p-[2.5px] transition-colors duration-300 ${
                seen ? "bg-border" : "bg-accent"
              }`}
            >
              <div className="rounded-[20px] bg-background p-[2px]">
                <Avatar
                  name={s.name}
                  hue={s.hue}
                  size={56}
                  className="rounded-[18px]"
                />
              </div>
            </div>
            <span className="max-w-full truncate text-xs text-muted">
              {s.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
