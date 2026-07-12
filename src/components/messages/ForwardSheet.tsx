"use client";

import { useEffect, useState } from "react";
import { Search, Check, Loader2, Share } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

type Friend = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

export type ForwardableMsg = {
  kind: string;
  body: string | null;
  post_id?: string | null;
  shot_id?: string | null;
};

/**
 * Forward a message to a friend's DM. Replicates the message (same kind +
 * content) via send_message; text bodies get a small forwarded marker so the
 * recipient knows it isn't originally the sender's words.
 */
export function ForwardSheet({
  open,
  onClose,
  msg,
}: {
  open: boolean;
  onClose: () => void;
  msg: ForwardableMsg | null;
}) {
  const supabase = createClient();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const [followingRes, followerRes] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(100),
        supabase.from("follows").select("follower_id").eq("following_id", user.id).limit(100),
      ]);
      const ids = new Set<string>();
      followingRes.data?.forEach((r: any) => ids.add(r.following_id));
      followerRes.data?.forEach((r: any) => ids.add(r.follower_id));
      ids.delete(user.id);
      if (ids.size === 0) { setFriends([]); setLoading(false); return; }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url")
        .in("id", [...ids])
        .eq("profile_completed", true)
        .limit(80);
      setFriends((profiles ?? []) as Friend[]);
      setLoading(false);
    })();
  }, [open, supabase]);

  useEffect(() => {
    if (!open) { setQuery(""); setSentTo(new Set()); }
  }, [open]);

  async function forwardTo(friend: Friend) {
    if (!msg || busy || sentTo.has(friend.id)) return;
    setBusy(friend.id);
    const { data: convId, error: convErr } = await supabase.rpc("get_or_create_dm", { p_other: friend.id });
    if (convErr || !convId) { setBusy(null); return; }
    const body =
      msg.kind === "text" && msg.body ? `↪️ Forwarded — ${msg.body}` : msg.body;
    const { error } = await supabase.rpc("send_message", {
      p_conversation_id: convId,
      p_body: body,
      p_kind: msg.kind,
      p_post_id: msg.post_id ?? null,
      p_reply_to_id: null,
      p_shot_id: msg.shot_id ?? null,
    });
    setBusy(null);
    if (!error) setSentTo((s) => new Set(s).add(friend.id));
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? friends.filter(
        (f) =>
          (f.display_name ?? "").toLowerCase().includes(q) ||
          (f.username ?? "").toLowerCase().includes(q),
      )
    : friends;

  return (
    <BottomSheet open={open} onClose={onClose} title="Forward to">
      <div className="relative pb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -mt-1.5 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="input pl-10"
        />
      </div>

      <div className="flex min-h-[220px] flex-col pb-3">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 size={22} className="animate-spin text-faint" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon={Share} title="No one to forward to" text="Follow people to message them." variant="compact" />
        ) : (
          visible.map((f) => {
            const name = f.display_name ?? f.username ?? "User";
            const done = sentTo.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => forwardTo(f)}
                disabled={busy === f.id || done}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-80"
              >
                <Avatar name={name} hue={f.avatar_hue ?? 280} size={44} src={f.avatar_url ?? undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{name}</span>
                  {f.username && <span className="block truncate text-xs text-muted">@{f.username}</span>}
                </span>
                <span
                  className={`shrink-0 rounded-pill px-3 py-1 text-xs font-bold ${
                    done ? "bg-surface text-accent" : "bg-accent text-accent-ink"
                  }`}
                >
                  {busy === f.id ? <Loader2 size={13} className="animate-spin" /> : done ? <Check size={13} /> : "Send"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </BottomSheet>
  );
}
