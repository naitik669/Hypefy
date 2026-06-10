"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Show } from "@/lib/mock";

type CurrentUser = {
  name: string;
  hue: number;
  avatarUrl?: string | null;
  hasActiveShow: boolean;
  showId?: string; // entry show to watch your own
};

const STORAGE_KEY = "hypefy_seen_shows";

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function ShowsRow({
  shows,
  currentUser,
}: {
  shows: Show[];
  currentUser?: CurrentUser;
}) {
  const router = useRouter();
  // Persisted across navigation via localStorage (resolved after mount to
  // avoid hydration mismatch).
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSeenIds(readSeen());
  }, []);

  function handleShowTap(id: string) {
    setSeenIds((prev) => {
      const next = new Set([...prev, id]);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    router.push(`/shows/${id}`);
  }

  // Unseen first (left), seen shift to the right
  const unseen = shows.filter((s) => !seenIds.has(s.id) && !s.seen);
  const seen   = shows.filter((s) =>  seenIds.has(s.id) ||  s.seen);
  const sorted = [...unseen, ...seen];

  // Whether the current user has already watched their own active show
  const ownShowSeen = !!(currentUser?.showId && seenIds.has(currentUser.showId));

  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-4">

      {/* ── Your Show ───────────────────────────── */}
      <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (currentUser?.hasActiveShow && currentUser.showId) {
                // Use handleShowTap so the seenId is recorded → ring disappears
                handleShowTap(currentUser.showId);
              } else {
                router.push("/shows/add");
              }
            }}
            aria-label={currentUser?.hasActiveShow ? "Watch your Show" : "Add a Show"}
            className="block active:opacity-70"
          >
            {currentUser ? (
              <div
                className={`rounded-[22px] p-[2.5px] ${
                  currentUser.hasActiveShow && !ownShowSeen ? "bg-accent" : "bg-transparent"
                }`}
              >
                <div
                  className={`rounded-[20px] bg-background ${
                    currentUser.hasActiveShow && !ownShowSeen ? "p-[2px]" : ""
                  }`}
                >
                  <Avatar name={currentUser.name} hue={currentUser.hue} size={56} src={currentUser.avatarUrl ?? undefined} className="rounded-[18px]" />
                </div>
              </div>
            ) : (
              <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[20px] border-2 border-dashed border-border bg-surface">
                <Plus size={20} className="text-muted" strokeWidth={2.4} />
              </div>
            )}
          </button>

          {/* Add-show badge — always opens the camera */}
          <Link
            href="/shows/add"
            aria-label="Add a Shot"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink ring-4 ring-background"
          >
            <Plus size={13} strokeWidth={3} />
          </Link>
        </div>
        <span className="max-w-full truncate text-xs text-muted">Your Shot</span>
      </div>

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
              /* ── Seen: grey ring, avatar stays full opacity ── */
              <div className="rounded-[22px] p-[2.5px]" style={{ background: "#3a3a3a" }}>
                <div className="rounded-[20px] bg-background p-[2px]">
                  <Avatar name={s.name} hue={s.hue} size={56} src={s.avatar_url ?? undefined} className="rounded-[18px]" />
                </div>
              </div>
            ) : (
              /* ── Unseen: green ring ── */
              <div className="rounded-[22px] p-[2.5px] bg-accent">
                <div className="rounded-[20px] bg-background p-[2px]">
                  <Avatar name={s.name} hue={s.hue} size={56} src={s.avatar_url ?? undefined} className="rounded-[18px]" />
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
