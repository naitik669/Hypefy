"use client";

import { useEffect, useState } from "react";
import { Star, Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { formatCount } from "@/lib/mock";

type CommentRow = {
  id: string;
  body: string;
  hype_count: number;
  created_at: string;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
  } | null;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CommentsSheet({
  open,
  onClose,
  postId,
  postOwnerId,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  postOwnerId: string;
  currentUserId: string;
}) {
  const supabase = createClient();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("comments")
      .select("id, body, hype_count, created_at, profiles(display_name, username, avatar_hue)")
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setComments(
          (data ?? []).map((c) => ({
            ...c,
            profiles: Array.isArray(c.profiles) ? c.profiles[0] ?? null : c.profiles,
          })),
        );
        setLoading(false);
      });
  }, [open, postId, supabase]);

  async function post() {
    if (!text.trim() || posting) return;
    setPosting(true);
    const { data, error } = await supabase.rpc("create_comment", {
      p_post_id: postId,
      p_body: text.trim(),
      p_owner_id: postOwnerId,
    });
    setPosting(false);
    if (error || !data) return;
    // Fetch the new comment with profile
    const { data: row } = await supabase
      .from("comments")
      .select("id, body, hype_count, created_at, profiles(display_name, username, avatar_hue)")
      .eq("id", data)
      .single();
    if (row) {
      const norm = {
        ...row,
        profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
      };
      setComments((c) => [...c, norm]);
    }
    setText("");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Comments · ${comments.length}`}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-muted" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">
          No comments yet. Be the first.
        </p>
      ) : (
        <div className="flex flex-col gap-4 pb-3 pt-1">
          {comments.map((c) => {
            const n = c.profiles?.display_name ?? c.profiles?.username ?? "User";
            const hue = c.profiles?.avatar_hue ?? 280;
            return (
              <div key={c.id} className="flex gap-3">
                <Avatar name={n} hue={hue} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold">{n}</span>
                    <span className="text-xs text-faint">· {timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground/90">{c.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-0.5 text-faint">
                  <Star size={14} />
                  <span className="text-[10px]">{formatCount(c.hype_count)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-border bg-elevated px-5 py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && post()}
          placeholder="Add a comment…"
          className="h-10 flex-1 rounded-pill bg-surface px-4 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={post}
          disabled={!text.trim() || posting}
          aria-label="Send comment"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40"
        >
          {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </BottomSheet>
  );
}
