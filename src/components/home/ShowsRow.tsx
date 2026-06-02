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
  hasActiveShow: boolean;
};

export function ShowsRow({
  shows,
  currentUser,
}: {
  shows: Show[];
  currentUser?: CurrentUser;
}) {
  const router = useRouter();
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  function handleShowTap(id: string) {
    setSeenIds((prev) => new Set([...prev, id]));
    router.push(`/shows/${id}`);
  }

  // Unseen first (left), seen shift to the right
  const unseen = shows.filter((s) => !seenIds.has(s.id) && !s.seen);
  const seen   = shows.filter((s) =>  seenIds.has(s.id) ||  s.seen);
  const sorted = [...unseen, ...seen];

  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-4">

      {/* ── Your Show ───────────────────────────── */}
      <Link href="/shows/add" className="flex w-16 shrink-0 flex-col items-center gap-1.5">
        <div className="relative">
          {currentUser ? (
            <div
              className={`rounded-[22px] p-[2.5px] ${
                currentUser.hasActiveShow
                  ? "bg-accent"          // green ring: you have an active show
                  : "bg-transparent"     // no ring: no active show
              }`}
            >
              <div
                className={`rounded-[20px] bg-background ${
                  currentUser.hasActiveShow ? "p-[2px]" : ""
                }`}
              >
                <Avatar
                  name={currentUser.name}
                  hue={currentUser.hue}
                  size={56}
                  className="rounded-[18px]"
                />
              </div>
            </div>
          ) : (
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[20px] border-2 border-dashed border-border bg-surface">
              <Plus size={20} className="text-muted" strokeWidth={2.4} />
            </div>
          )}

          {/* Add-show badge */}
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink ring-4 ring-background">
            <Plus size={13} strokeWidth={3} />
          </span>
        </div>
        <span className="max-w-full truncate text-xs text-muted">Your Show</span>
      </Link>

      {/* ── Sorted shows (unseen first, seen right) ── */}
      {sorted.map((s) => {
        const isSeen = seenIds.has(s.id) || s.seen;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => handleShowTap(s.id)}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 active:opacity-70"
          >
            {isSeen ? (
              /* ── Seen: plain avatar, no coloured ring, slightly dimmed ── */
              <div className="rounded-[20px] opacity-50">
                <Avatar name={s.name} hue={s.hue} size={60} className="rounded-[18px]" />
              </div>
            ) : (
              /* ── Unseen: bold green ring ── */
              <div className="rounded-[22px] p-[2.5px] bg-accent shadow-[0_0_0_0px_rgba(200,255,0,0)]">
                <div className="rounded-[20px] bg-background p-[2px]">
                  <Avatar name={s.name} hue={s.hue} size={56} className="rounded-[18px]" />
                </div>
              </div>
            )}
            <span
              className={`max-w-full truncate text-xs transition-colors ${
                isSeen ? "text-faint" : "text-muted"
              }`}
            >
              {s.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
