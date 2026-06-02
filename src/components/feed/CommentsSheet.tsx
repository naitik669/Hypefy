"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Send, Loader2, CornerDownRight, Flag, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { formatCount } from "@/lib/mock";

type CommentRow = {
  id: string;
  body: string;
  hype_count: number;
  created_at: string;
  profiles: { display_name: string | null; username: string | null; avatar_hue: number | null } | null;
  // local UI state
  hyped?: boolean;
  localHypeCount?: number;
  reported?: boolean;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CommentsSheet({
  open, onClose, postId, postOwnerId, currentUserId,
}: {
  open: boolean; onClose: () => void;
  postId: string; postOwnerId: string; currentUserId: string;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ username: string; id: string } | null>(null);

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
          (data ?? []).map((c: any) => ({
            ...c,
            profiles: Array.isArray(c.profiles) ? c.profiles[0] ?? null : c.profiles,
            hyped: false,
            localHypeCount: c.hype_count,
          })),
        );
        setLoading(false);
      });
  }, [open, postId, supabase]);

  // After close, reset reply state
  useEffect(() => { if (!open) { setReplyTo(null); setText(""); } }, [open]);

  function startReply(username: string, id: string) {
    setReplyTo({ username, id });
    setText(`@${username} `);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function hypeComment(c: CommentRow) {
    if (!currentUserId) return;
    const wasHyped = c.hyped ?? false;
    setComments((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? { ...x, hyped: !wasHyped, localHypeCount: (x.localHypeCount ?? x.hype_count) + (wasHyped ? -1 : 1) }
          : x,
      ),
    );
    await supabase.rpc("toggle_hype", {
      p_target_type: "comment",
      p_target_id: c.id,
      p_owner_id: null,
    });
  }

  function reportComment(id: string) {
    setComments((prev) => prev.map((x) => (x.id === id ? { ...x, reported: true } : x)));
    setTimeout(() => {
      setComments((prev) => prev.map((x) => (x.id === id ? { ...x, reported: false } : x)));
    }, 1500);
  }

  async function submitComment() {
    if (!text.trim() || posting) return;
    setPosting(true);
    const { data, error } = await supabase.rpc("create_comment", {
      p_post_id: postId,
      p_body: text.trim(),
      p_owner_id: postOwnerId,
    });
    setPosting(false);
    if (error || !data) return;

    const { data: row } = await supabase
      .from("comments")
      .select("id, body, hype_count, created_at, profiles(display_name, username, avatar_hue)")
      .eq("id", data)
      .single();
    if (row) {
      const norm: CommentRow = {
        ...(row as any),
        profiles: Array.isArray((row as any).profiles) ? (row as any).profiles[0] ?? null : (row as any).profiles,
        hyped: false,
        localHypeCount: 0,
      };
      setComments((c) => [...c, norm]);
    }
    setText("");
    setReplyTo(null);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Comments · ${comments.length}`}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-muted" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">No comments yet. Be the first.</p>
      ) : (
        <div className="flex flex-col gap-4 pb-3 pt-1">
          {comments.map((c) => {
            const n = c.profiles?.display_name ?? c.profiles?.username ?? "User";
            const uname = c.profiles?.username;
            const hue = c.profiles?.avatar_hue ?? 280;
            const isHyped = c.hyped ?? false;
            const count = c.localHypeCount ?? c.hype_count;
            return (
              <div key={c.id} className="flex gap-3">
                <Avatar name={n} hue={hue} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{n}</span>
                    <span className="text-xs text-faint">· {timeAgo(c.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground/90">{c.body}</p>

                  {/* Comment actions */}
                  <div className="mt-1.5 flex items-center gap-4">
                    {/* Hype comment */}
                    <button
                      type="button"
                      onClick={() => hypeComment(c)}
                      className={`flex items-center gap-1 text-xs font-medium ${isHyped ? "text-hype" : "text-faint hover:text-muted"}`}
                    >
                      <Star size={13} fill={isHyped ? "currentColor" : "none"} />
                      {count > 0 && formatCount(count)}
                    </button>
                    {/* Reply */}
                    {uname && (
                      <button
                        type="button"
                        onClick={() => startReply(uname, c.id)}
                        className="flex items-center gap-1 text-xs font-medium text-faint hover:text-muted"
                      >
                        <CornerDownRight size={12} /> Reply
                      </button>
                    )}
                    {/* Report */}
                    <button
                      type="button"
                      onClick={() => reportComment(c.id)}
                      className={`flex items-center gap-1 text-xs font-medium ${c.reported ? "text-accent" : "text-faint hover:text-muted"}`}
                    >
                      {c.reported ? <Check size={12} /> : <Flag size={12} />}
                      {c.reported ? "Reported" : "Report"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-elevated px-5 py-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <CornerDownRight size={12} />
            Replying to <span className="font-semibold text-foreground">@{replyTo.username}</span>
            <button onClick={() => { setReplyTo(null); setText(""); }} className="ml-auto text-faint hover:text-muted">✕</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitComment()}
            placeholder={replyTo ? `Reply to @${replyTo.username}…` : "Add a comment…"}
            className="h-10 flex-1 rounded-pill bg-surface px-4 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            onClick={submitComment}
            disabled={!text.trim() || posting}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40"
          >
            {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
