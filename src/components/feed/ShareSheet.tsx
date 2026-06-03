"use client";

import { useEffect, useState } from "react";
import { Link2, Zap, Repeat2, Check, Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";

type Friend = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
};

export function ShareSheet({
  open,
  onClose,
  postId,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
}) {
  const supabase = createClient();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [sendingDm, setSendingDm] = useState(false);
  const [dmDone, setDmDone] = useState(false);

  // Fetch everyone the user has a connection with:
  // following + followers + notification interaction partners (hypers, commenters, etc.)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Run all three queries in parallel
      const [followingRes, followerRes, notifRes] = await Promise.all([
        // People I follow
        supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(100),
        // People who follow me
        supabase.from("follows").select("follower_id").eq("following_id", user.id).limit(100),
        // Recent interaction partners (actors of my notifications)
        supabase.from("notifications")
          .select("actor_id")
          .eq("user_id", user.id)
          .not("actor_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      // Merge all unique IDs, exclude self
      const allIds = new Set<string>();
      followingRes.data?.forEach((r: any) => allIds.add(r.following_id));
      followerRes.data?.forEach((r: any) => allIds.add(r.follower_id));
      notifRes.data?.forEach((r: any) => r.actor_id && allIds.add(r.actor_id));
      allIds.delete(user.id);

      if (allIds.size === 0) { setFriends([]); setLoading(false); return; }

      // Fetch profiles for all merged IDs
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue")
        .in("id", [...allIds])
        .eq("profile_completed", true)
        .limit(80);

      setFriends((profiles ?? []) as Friend[]);
      setLoading(false);
    }
    load();
  }, [open, supabase]);

  // Reset on close
  useEffect(() => { if (!open) { setQuery(""); setSent(new Set()); } }, [open]);

  const filtered = friends.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (f.display_name ?? "").toLowerCase().includes(q) ||
      (f.username ?? "").toLowerCase().includes(q)
    );
  });

  function toggleSend(id: string) {
    setSent((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const postUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/${postId}`
    : `https://www.hypefy.chat/p/${postId}`;

  async function copyLink() {
    try { await navigator.clipboard.writeText(postUrl); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Hypefy post", url: postUrl });
        onClose();
      }
    } catch {}
  }

  function repost() {
    setReposted(true);
    setTimeout(() => { setReposted(false); onClose(); }, 900);
  }

  // Actually send the post into DMs for each selected friend
  async function sendToSelected() {
    if (sendingDm || sent.size === 0) return;
    setSendingDm(true);
    const ids = [...sent];
    await Promise.all(
      ids.map(async (uid) => {
        const { data: convId, error } = await supabase.rpc("get_or_create_dm", { p_other: uid });
        if (error || !convId) return;
        await supabase.rpc("send_message", {
          p_conversation_id: convId, p_body: null, p_kind: "post",
          p_post_id: postId, p_reply_to_id: null,
        });
      }),
    );
    setSendingDm(false);
    setDmDone(true);
    setTimeout(() => { setDmDone(false); setSent(new Set()); onClose(); }, 900);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Send to">
      {/* ── Search ────────────────────────────────────────── */}
      <div className="mb-3 flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-3 focus-within:border-accent/40">
        <Search size={15} className="shrink-0 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>

      {/* ── Friends list — vertical scroll ─────────────── */}
      <div className="flex flex-col overflow-y-auto" style={{ maxHeight: "42dvh" }}>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">
            {friends.length === 0
              ? "Follow people or interact with posts to see connections here."
              : "No results"}
          </p>
        ) : (
          filtered.map((f) => {
            const name = f.display_name ?? f.username ?? "User";
            const selected = sent.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleSend(f.id)}
                className={`flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors ${
                  selected ? "bg-accent/10" : "hover:bg-white/[0.04]"
                }`}
              >
                <Avatar name={name} hue={f.avatar_hue ?? 280} size={46} />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  {f.username && (
                    <p className="truncate text-xs text-muted">@{f.username}</p>
                  )}
                </div>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                    selected
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-border text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Send button — only when someone is selected */}
      {sent.size > 0 && (
        <button
          type="button"
          onClick={sendToSelected}
          disabled={sendingDm}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {sendingDm ? (
            <><Loader2 size={16} className="animate-spin" /> Sending…</>
          ) : dmDone ? (
            <><Check size={16} /> Sent</>
          ) : (
            <>Send to {sent.size} {sent.size === 1 ? "person" : "people"}</>
          )}
        </button>
      )}

      {/* ── Divider ────────────────────────────────────── */}
      <div className="my-3 h-px bg-border" />

      {/* ── Actions at bottom ─────────────────────────── */}
      <div className="flex flex-col gap-0.5 pb-1">
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-white/5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
            {copied ? <Check size={18} className="text-accent" /> : <Link2 size={18} />}
          </span>
          <span className={copied ? "text-accent" : "text-foreground"}>
            {copied ? "Link copied!" : "Copy link"}
          </span>
        </button>

        <button
          type="button"
          onClick={repost}
          className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-white/5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
            {reposted ? <Check size={18} className="text-accent" /> : <Repeat2 size={18} />}
          </span>
          <span className={reposted ? "text-accent" : "text-foreground"}>
            {reposted ? "Reposted!" : "Repost"}
          </span>
        </button>

        <button
          type="button"
          onClick={nativeShare}
          className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-white/5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
            <Zap size={18} className="text-hype" />
          </span>
          <span className="text-foreground">Share to Shot</span>
        </button>
      </div>
    </BottomSheet>
  );
}
