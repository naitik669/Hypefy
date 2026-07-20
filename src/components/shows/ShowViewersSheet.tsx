"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Star, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { haptics } from "@/lib/haptics";

type Viewer = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
  viewedAt: string;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Owner-only list of who viewed a Show. Pinned people (star toggle,
 * stored per-owner in pinned_viewers) always sort to the top, so the
 * views you care about surface first. Searchable by name/username.
 */
export function ShowViewersSheet({
  open,
  onClose,
  showId,
  ownerId,
}: {
  open: boolean;
  onClose: () => void;
  showId: string;
  ownerId: string;
}) {
  const supabase = createClient();
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const [viewsRes, pinsRes] = await Promise.all([
        supabase
          .from("show_views")
          .select("viewer_id, created_at, profiles:viewer_id(display_name, username, avatar_hue, avatar_url)")
          .eq("show_id", showId)
          .order("created_at", { ascending: false }),
        supabase.from("pinned_viewers").select("pinned_user_id").eq("owner_id", ownerId),
      ]);
      if (!active) return;
      setViewers(
        (viewsRes.data ?? []).map((v: any) => {
          const p = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
          return {
            id: v.viewer_id,
            name: p?.display_name ?? p?.username ?? "User",
            username: p?.username ?? null,
            hue: p?.avatar_hue ?? 280,
            avatarUrl: p?.avatar_url ?? null,
            viewedAt: v.created_at,
          };
        }),
      );
      setPinned(new Set((pinsRes.data ?? []).map((r: any) => r.pinned_user_id as string)));
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showId]);

  async function togglePin(id: string) {
    if (pendingId) return;
    setPendingId(id);
    haptics.select();
    const isPinned = pinned.has(id);
    setPinned((prev) => {
      const next = new Set(prev);
      isPinned ? next.delete(id) : next.add(id);
      return next;
    });
    const { error } = isPinned
      ? await supabase.from("pinned_viewers").delete().eq("owner_id", ownerId).eq("pinned_user_id", id)
      : await supabase.from("pinned_viewers").insert({ owner_id: ownerId, pinned_user_id: id });
    if (error) {
      setPinned((prev) => {
        const next = new Set(prev);
        isPinned ? next.add(id) : next.delete(id);
        return next;
      });
    }
    setPendingId(null);
  }

  const list = useMemo(() => {
    if (!viewers) return null;
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? viewers.filter(
          (v) => v.name.toLowerCase().includes(needle) || (v.username ?? "").toLowerCase().includes(needle),
        )
      : viewers;
    // Pinned first; view recency (already newest-first) preserved within each group.
    return [...filtered.filter((v) => pinned.has(v.id)), ...filtered.filter((v) => !pinned.has(v.id))];
  }, [viewers, pinned, q]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Viewers">
      <div className="flex flex-col gap-3 pb-3">
        {/* Search */}
        <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-white/25">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search viewers…"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>

        {list === null ? (
          <div className="flex flex-col gap-2 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3 w-1/3 rounded" />
                  <div className="skeleton h-2.5 w-1/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={Search}
            title={q ? "No one matches that" : "No views yet"}
            text={q ? "Try a different name or handle." : "Your Show just went up, give it a minute."}
          />
        ) : (
          <div className="flex flex-col">
            {list.map((v) => {
              const isPinned = pinned.has(v.id);
              return (
                <div key={v.id} className="flex items-center gap-3 py-2">
                  <Avatar name={v.name} hue={v.hue} size={44} src={v.avatarUrl ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{v.name}</p>
                    <p className="truncate text-xs text-muted">
                      {v.username ? `@${v.username} · ` : ""}{timeAgo(v.viewedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={isPinned ? "Unpin viewer" : "Pin viewer"}
                    disabled={pendingId === v.id}
                    onClick={() => togglePin(v.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-60"
                  >
                    {pendingId === v.id ? (
                      <Loader2 size={18} className="animate-spin text-muted" />
                    ) : (
                      <Star
                        size={18}
                        className={isPinned ? "text-hype" : "text-muted"}
                        fill={isPinned ? "currentColor" : "none"}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
