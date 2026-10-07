"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, VolumeX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { QUIET_COPY, unmuteUser } from "@/lib/feed-quiet";

type MutedRow = {
  userId: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

/**
 * Everyone you have muted, with one-tap unmute. Lives in Privacy settings,
 * under the blocked list.
 *
 * No confirmation, unlike unblocking: unmuting only puts someone's posts
 * back in your feed, and muting them again is one tap.
 */
export function MutedList({ currentUserId }: { currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<MutedRow[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: muted } = await supabase
        .from("muted_users")
        .select("muted_id, created_at")
        .eq("muter_id", currentUserId)
        .order("created_at", { ascending: false });
      const ids = (muted ?? []).map((m) => m.muted_id as string);
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id, display_name, username, avatar_hue, avatar_url").in("id", ids)
        : { data: [] };
      if (!active) return;
      const byId = new Map((people ?? []).map((p) => [p.id as string, p]));
      setRows(
        ids.flatMap((id) => {
          const p = byId.get(id);
          // An account that was deleted since: nothing to show, nothing to unmute.
          if (!p) return [];
          return [
            {
              userId: id,
              name: (p.display_name as string | null) ?? (p.username as string | null) ?? "User",
              username: (p.username as string | null) ?? null,
              hue: (p.avatar_hue as number | null) ?? 280,
              avatarUrl: (p.avatar_url as string | null) ?? null,
            },
          ];
        }),
      );
    })();
    return () => {
      active = false;
    };
  }, [supabase, currentUserId]);

  async function unmute(row: MutedRow) {
    if (pendingId) return;
    setPendingId(row.userId);
    if (await unmuteUser(supabase, currentUserId, row.userId)) {
      setRows((prev) => (prev ?? []).filter((r) => r.userId !== row.userId));
      toast(QUIET_COPY.unmuted(row.username ? `@${row.username}` : row.name), "success");
    } else {
      toast("Couldn't unmute, try again", "error");
    }
    setPendingId(null);
  }

  if (rows === null) {
    return (
      <div className="flex flex-col gap-3 py-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
            <div className="skeleton h-3 w-1/3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={VolumeX}
        title="Nobody muted"
        text="Mute someone from their profile or a post's ⋯ menu. Their posts leave your feed and they aren't told."
      />
    );
  }

  return (
    <div className="flex flex-col" data-muted-list>
      {rows.map((r) => (
        <div key={r.userId} className="flex items-center gap-3 py-2.5">
          <Avatar name={r.name} hue={r.hue} size={40} src={r.avatarUrl ?? undefined} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{r.name}</p>
            {r.username && <p className="truncate text-xs text-muted">@{r.username}</p>}
          </div>
          <button
            type="button"
            onClick={() => unmute(r)}
            disabled={pendingId === r.userId}
            className="flex h-9 min-w-[88px] items-center justify-center rounded-xl border border-border text-xs font-bold text-foreground transition-colors hover:bg-white/5"
          >
            {pendingId === r.userId ? <Loader2 size={14} className="animate-spin" /> : "Unmute"}
          </button>
        </div>
      ))}
    </div>
  );
}
