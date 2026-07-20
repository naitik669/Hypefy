"use client";

import { useEffect, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";

type BlockedRow = {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

/** Everyone you've blocked, with one-tap unblock. Lives in Privacy settings. */
export function BlockedList({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState<BlockedRow[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("blocked_users")
        .select("id, blocked_id, profiles:blocked_id(display_name, username, avatar_hue, avatar_url)")
        .eq("blocker_id", currentUserId)
        .order("created_at", { ascending: false });
      if (!active) return;
      setRows(
        (data ?? []).map((r: any) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return {
            id: r.id,
            userId: r.blocked_id,
            name: p?.display_name ?? p?.username ?? "User",
            username: p?.username ?? null,
            hue: p?.avatar_hue ?? 280,
            avatarUrl: p?.avatar_url ?? null,
          };
        }),
      );
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  async function unblock(row: BlockedRow) {
    if (pendingId) return;
    setPendingId(row.id);
    const { error } = await supabase.from("blocked_users").delete().eq("id", row.id);
    if (error) {
      toast("Couldn't unblock, try again", "error");
    } else {
      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
      toast(`Unblocked ${row.username ? `@${row.username}` : row.name}`, "success");
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
        icon={Ban}
        title="Nobody blocked"
        text="Block someone from their profile or a post's ⋯ menu, they land here."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2.5">
          <Avatar name={r.name} hue={r.hue} size={40} src={r.avatarUrl ?? undefined} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{r.name}</p>
            {r.username && <p className="truncate text-xs text-muted">@{r.username}</p>}
          </div>
          <button
            type="button"
            onClick={() => unblock(r)}
            disabled={pendingId === r.id}
            className="flex h-9 min-w-[88px] items-center justify-center rounded-xl border border-border text-xs font-bold text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            {pendingId === r.id ? <Loader2 size={14} className="animate-spin" /> : "Unblock"}
          </button>
        </div>
      ))}
    </div>
  );
}
