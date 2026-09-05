"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FollowButton } from "@/components/profile/FollowButton";
import { formatCount } from "@/lib/format";

export type PersonRow = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
  at: string;
};

/**
 * A paginated list of people.
 *
 * Rows link out instead of closing a sheet, which is the whole reason this is
 * a page: you can open someone, look, and come back to your place in the list.
 */
export function PeopleList({
  ownerId,
  list,
  initial,
  total,
  iFollowIds,
  currentUserId,
  locked,
  lockedName,
  pageSize,
}: {
  ownerId: string;
  list: "followers" | "following";
  initial: PersonRow[];
  total: number;
  iFollowIds: string[];
  currentUserId: string;
  locked: boolean;
  lockedName: string;
  pageSize: number;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState(initial);
  const [done, setDone] = useState(initial.length >= total || initial.length < pageSize);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const iFollow = new Set(iFollowIds);

  const loadMore = useCallback(async () => {
    if (busy.current || done) return;
    busy.current = true;
    setLoading(true);

    const joinCol = list === "followers" ? "follower_id" : "following_id";
    const matchCol = list === "followers" ? "following_id" : "follower_id";
    const cursor = rows[rows.length - 1]?.at;

    const { data, error } = await supabase
      .from("follows")
      .select(
        `created_at, profile:profiles!${joinCol}(id, display_name, username, avatar_hue, avatar_url)`
      )
      .eq(matchCol, ownerId)
      .lt("created_at", cursor ?? new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(pageSize);

    // Don't latch done on a failure — a blip would permanently shorten the list.
    if (!error) {
      const fresh: PersonRow[] = (data ?? []).flatMap((r: Record<string, unknown>) => {
        const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
        if (!p) return [];
        const prof = p as Record<string, unknown>;
        return [
          {
            id: prof.id as string,
            name: (prof.display_name as string) ?? (prof.username as string) ?? "User",
            username: (prof.username as string) ?? null,
            hue: (prof.avatar_hue as number) ?? 280,
            avatarUrl: (prof.avatar_url as string) ?? null,
            at: r.created_at as string,
          },
        ];
      });
      setRows((prev) => [...prev, ...fresh]);
      if ((data?.length ?? 0) < pageSize) setDone(true);
    }

    setLoading(false);
    busy.current = false;
  }, [done, list, ownerId, rows, supabase, pageSize]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  if (locked) {
    return (
      <EmptyState
        icon={Lock}
        title="This account is private"
        text={`Follow ${lockedName} to see who they're connected to.`}
        variant="compact"
      />
    );
  }

  const term = q.trim().toLowerCase();
  // Filters what is loaded, which is honest as long as the count says how many
  // there are in total.
  const shown = term
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          (r.username ?? "").toLowerCase().includes(term)
      )
    : rows;

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-xl">
        <div className="flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-3">
          <Search size={15} className="shrink-0 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${total > 0 ? formatCount(total) + " " : ""}${list}`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title={term ? "Nobody by that name" : list === "followers" ? "No followers yet" : "Not following anyone"}
          text={
            term
              ? "Try a different name."
              : list === "followers"
                ? "Share a post — followers find you fast here."
                : "Find your people in Discover."
          }
          variant="compact"
        />
      ) : (
        <div className="flex flex-col divide-y divide-border/50">
          {shown.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <Link
                href={r.username ? `/u/${r.username}` : "#"}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar name={r.name} hue={r.hue} src={r.avatarUrl ?? undefined} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  {r.username && (
                    <span className="block truncate text-xs text-muted">@{r.username}</span>
                  )}
                </span>
              </Link>
              {r.id !== currentUserId && (
                <FollowButton
                  targetUserId={r.id}
                  initialFollowing={iFollow.has(r.id)}
                  variant="inline"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {!done && !term && (
        <div ref={sentinel} className="flex justify-center py-6">
          {loading && <Loader2 size={18} className="animate-spin text-muted" />}
        </div>
      )}
    </div>
  );
}
