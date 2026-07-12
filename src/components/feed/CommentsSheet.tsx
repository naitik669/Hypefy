"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Send, Loader2, Flag, Check, ChevronDown, Trash2, CornerUpLeft, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { Avatar } from "@/components/ui/Avatar";
import { ZoomViewer } from "@/components/ui/ZoomViewer";
import { GifPicker } from "@/components/messages/GifPicker";
import { formatCount } from "@/lib/format";
import { useMentionHashtag, applySuggestion, SuggestionDropdown } from "@/components/ui/MentionHashtagPicker";

const isGifBody = (body: string) => body.startsWith("https://");

/* --- Types ---------------------------------------------------------------- */
type RawComment = {
  id: string;
  user_id: string;
  body: string;
  hype_count: number;
  created_at: string;
  parent_id: string | null;
  profiles: { display_name: string | null; username: string | null; avatar_hue: number | null; avatar_url?: string | null } | null;
};

type Comment = RawComment & {
  hyped: boolean;
  localHypeCount: number;
  reported: boolean;
  replies: Comment[];
  showReplies: boolean;
};

/* --- Helpers -------------------------------------------------------------- */
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Total comments including replies (every node in the tree). */
function countAll(list: Comment[]): number {
  return list.reduce((n, c) => n + 1 + countAll(c.replies), 0);
}

function buildTree(flat: RawComment[]): Comment[] {
  const map = new Map<string, Comment>();
  const roots: Comment[] = [];

  for (const c of flat) {
    map.set(c.id, { ...c, hyped: false, localHypeCount: c.hype_count, reported: false, replies: [], showReplies: false });
  }
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

/* --- Main component ------------------------------------------------------- */
export function CommentsSheet({
  open, onClose, postId, postOwnerId, currentUserId, onCountChange,
  targetType = "post",
}: {
  open: boolean; onClose: () => void;
  postId: string; postOwnerId: string; currentUserId: string;
  onCountChange?: (count: number) => void;
  /** Whether comments belong to a post (default) or a shot/reel. */
  targetType?: "post" | "shot";
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tree, setTree] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentCursor, setCommentCursor] = useState(0);
  const { suggestions: pickerSuggestions, reset: resetPicker } = useMentionHashtag(text, commentCursor);
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("comments")
      .select("id, user_id, body, hype_count, created_at, parent_id, profiles(display_name, username, avatar_hue, avatar_url)")
      .eq(targetType === "shot" ? "shot_id" : "post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const flat: RawComment[] = (data ?? []).map((c: any) => ({
          ...c,
          profiles: Array.isArray(c.profiles) ? c.profiles[0] ?? null : c.profiles,
        }));
        setTree(buildTree(flat));
        setLoading(false);
      });
  }, [open, postId, targetType, supabase]);

  useEffect(() => { if (!open) { setReplyTo(null); setText(""); setGifPickerOpen(false); } }, [open]);

  // Keep the parent's comment badge in sync -- counts replies too.
  const totalCount = countAll(tree);
  useEffect(() => {
    if (open) onCountChange?.(totalCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount, open]);

  function startReply(id: string, username: string) {
    setReplyTo({ id, username });
    setText(`@${username} `);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function cancelReply() { setReplyTo(null); setText(""); }

  /* mutate a comment in the tree by id */
  function mutateFn(id: string, fn: (c: Comment) => Comment): void {
    function walk(list: Comment[]): Comment[] {
      return list.map((c) => {
        if (c.id === id) return fn(c);
        return { ...c, replies: walk(c.replies) };
      });
    }
    setTree((prev) => walk(prev));
  }

  async function hypeComment(c: Comment) {
    if (!currentUserId) return;
    mutateFn(c.id, (x) => ({ ...x, hyped: !x.hyped, localHypeCount: x.localHypeCount + (x.hyped ? -1 : 1) }));
    await supabase.rpc("toggle_hype", { p_target_type: "comment", p_target_id: c.id, p_owner_id: null });
  }

  function reportComment(id: string) {
    if (!currentUserId) return;
    setReportTarget(id);
  }

  async function deleteComment(id: string) {
    // Soft-delete: set deleted_at
    await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    // Remove from tree immediately
    function removeById(list: Comment[]): Comment[] {
      return list
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, replies: removeById(c.replies) }));
    }
    setTree((prev) => removeById(prev));
  }

  function toggleReplies(id: string) {
    mutateFn(id, (x) => ({ ...x, showReplies: !x.showReplies }));
  }

  // Long-press target: the comment + the top-level id replies thread under.
  const [actionC, setActionC] = useState<{ c: Comment; threadId: string } | null>(null);

  async function submitComment() {
    if (!text.trim() || posting) return;
    setPosting(true);
    const { data, error } =
      targetType === "shot"
        ? await supabase.rpc("create_shot_comment", {
            p_shot_id: postId,
            p_body: text.trim(),
            p_owner_id: postOwnerId,
            p_parent_id: replyTo?.id ?? null,
          })
        : await supabase.rpc("create_comment", {
            p_post_id: postId,
            p_body: text.trim(),
            p_owner_id: postOwnerId,
            p_parent_id: replyTo?.id ?? null,
          });
    setPosting(false);
    if (error || !data) return;

    const { data: row } = await supabase
      .from("comments")
      .select("id, user_id, body, hype_count, created_at, parent_id, profiles(display_name, username, avatar_hue, avatar_url)")
      .eq("id", data)
      .single();

    if (row) {
      const newComment: Comment = {
        ...(row as any),
        profiles: Array.isArray((row as any).profiles) ? (row as any).profiles[0] ?? null : (row as any).profiles,
        hyped: false,
        localHypeCount: 0,
        reported: false,
        replies: [],
        showReplies: false,
      };

      if (replyTo?.id) {
        // append as reply under parent, auto-expand
        mutateFn(replyTo.id, (parent) => ({
          ...parent,
          replies: [...parent.replies, newComment],
          showReplies: true,
        }));
      } else {
        setTree((prev) => [...prev, newComment]);
      }
    }

    setText("");
    setReplyTo(null);
  }

  async function submitGif(gifUrl: string) {
    if (posting) return;
    setGifPickerOpen(false);
    setPosting(true);
    const { data, error } =
      targetType === "shot"
        ? await supabase.rpc("create_shot_comment", {
            p_shot_id: postId,
            p_body: gifUrl,
            p_owner_id: postOwnerId,
            p_parent_id: replyTo?.id ?? null,
          })
        : await supabase.rpc("create_comment", {
            p_post_id: postId,
            p_body: gifUrl,
            p_owner_id: postOwnerId,
            p_parent_id: replyTo?.id ?? null,
          });
    setPosting(false);
    if (error || !data) return;

    const { data: row } = await supabase
      .from("comments")
      .select("id, user_id, body, hype_count, created_at, parent_id, profiles(display_name, username, avatar_hue, avatar_url)")
      .eq("id", data)
      .single();

    if (row) {
      const newComment: Comment = {
        ...(row as any),
        profiles: Array.isArray((row as any).profiles) ? (row as any).profiles[0] ?? null : (row as any).profiles,
        hyped: false,
        localHypeCount: 0,
        reported: false,
        replies: [],
        showReplies: false,
      };
      if (replyTo?.id) {
        mutateFn(replyTo.id, (parent) => ({ ...parent, replies: [...parent.replies, newComment], showReplies: true }));
      } else {
        setTree((prev) => [...prev, newComment]);
      }
    }
    setReplyTo(null);
  }

  return (
    <>
    <BottomSheet open={open} onClose={onClose} title={`Comments · ${totalCount}`}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-muted" />
        </div>
      ) : tree.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">Quiet so far. Drop the first take.</p>
      ) : (
        <div className="flex flex-col gap-5 pb-3 pt-1">
          {tree.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              onHype={hypeComment}
              onReply={startReply}
              onReport={reportComment}
              onDelete={deleteComment}
              onToggleReplies={toggleReplies}
              onLongPress={(c, threadId) => setActionC({ c, threadId })}
            />
          ))}
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-elevated px-5 pb-3 pt-2">
        {/* GIF picker panel */}
        {gifPickerOpen && (
          <div className="mb-2">
            <GifPicker onSelect={submitGif} />
          </div>
        )}

        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <CornerUpLeft size={13} className="text-faint" />
            Replying to{" "}
            <span className="font-semibold text-foreground">@{replyTo.username}</span>
            <button onClick={cancelReply} className="ml-auto text-faint hover:text-muted">×</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* GIF toggle button */}
          <button
            type="button"
            onClick={() => setGifPickerOpen((v) => !v)}
            className={`flex h-9 items-center justify-center rounded-lg px-2 text-[11px] font-black tracking-wide transition-colors ${
              gifPickerOpen ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            GIF
          </button>

          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setCommentCursor(e.target.selectionStart ?? 0); }}
              onSelect={(e) => setCommentCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
              onBlur={() => setTimeout(resetPicker, 150)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitComment()}
              placeholder={replyTo ? `Reply to @${replyTo.username}...` : "Add a comment..."}
              className="h-10 w-full rounded-pill bg-surface px-4 text-sm outline-none placeholder:text-faint focus:border-white/25"
            />
            <SuggestionDropdown suggestions={pickerSuggestions} onSelect={(s) => {
              const { newValue, newCursor } = applySuggestion(text, commentCursor, s);
              setText(newValue);
              setCommentCursor(newCursor);
              setTimeout(() => inputRef.current?.setSelectionRange(newCursor, newCursor), 0);
              resetPicker();
            }} />
          </div>
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

    {reportTarget && currentUserId && (
      <ReportSheet
        open
        onClose={() => setReportTarget(null)}
        targetType="comment"
        targetId={reportTarget}
        currentUserId={currentUserId}
        onReported={() => mutateFn(reportTarget, (x) => ({ ...x, reported: true }))}
      />
    )}

    {/* Long-press comment actions */}
    <BottomSheet open={!!actionC} onClose={() => setActionC(null)} title="Comment">
      {actionC && (
        <div className="flex flex-col gap-1 pb-3">
          {actionC.c.profiles?.username && (
            <button
              type="button"
              onClick={() => { startReply(actionC.threadId, actionC.c.profiles!.username!); setActionC(null); }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-white/5"
            >
              <CornerUpLeft size={17} className="text-muted" /> Reply
            </button>
          )}
          {!isGifBody(actionC.c.body) && (
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(actionC.c.body).catch(() => {}); setActionC(null); }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-white/5"
            >
              <Copy size={17} className="text-muted" /> Copy
            </button>
          )}
          {actionC.c.user_id !== currentUserId && (
            <button
              type="button"
              onClick={() => { reportComment(actionC.c.id); setActionC(null); }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-white/5"
            >
              <Flag size={17} className="text-muted" /> Report
            </button>
          )}
          {actionC.c.user_id === currentUserId && (
            <button
              type="button"
              onClick={() => { deleteComment(actionC.c.id); setActionC(null); }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-danger hover:bg-danger/5"
            >
              <Trash2 size={17} /> Delete
            </button>
          )}
        </div>
      )}
    </BottomSheet>
    </>
  );
}

/* --- Single comment + thread ---------------------------------------------- */
function CommentItem({
  comment, currentUserId, onHype, onReply, onReport, onDelete, onToggleReplies, onLongPress,
}: {
  comment: Comment;
  currentUserId: string;
  onHype: (c: Comment) => void;
  onReply: (id: string, username: string) => void;
  onReport: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleReplies: (id: string) => void;
  onLongPress: (c: Comment, threadId: string) => void;
}) {
  const n = comment.profiles?.display_name ?? comment.profiles?.username ?? "User";
  const uname = comment.profiles?.username;
  const hue = comment.profiles?.avatar_hue ?? 280;
  const hasReplies = comment.replies.length > 0;
  const isOwnComment = comment.user_id === currentUserId;
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  // Hold-to-act: 450ms press (or right-click) on a comment body opens the
  // action sheet — delete/copy/report/reply without hunting tiny buttons.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function holdHandlers(c: Comment, threadId: string) {
    return {
      onPointerDown: () => {
        pressTimer.current = setTimeout(() => { pressTimer.current = null; onLongPress(c, threadId); }, 450);
      },
      onPointerUp: () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } },
      onPointerLeave: () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } },
      onPointerMove: () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } },
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onLongPress(c, threadId); },
    };
  }

  return (
    <>
    <div>
      {/* Parent comment */}
      <div className="flex gap-3">
        {/* Avatar column -- shows the vertical thread line below if replies are open */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label={`View ${n}'s photo`}
            onClick={() => { const src = comment.profiles?.avatar_url; if (src) setZoomSrc(src); }}
            className="shrink-0 active:scale-95 transition-transform"
          >
            <Avatar name={n} hue={hue} size={34} src={comment.profiles?.avatar_url ?? undefined} />
          </button>
          {hasReplies && comment.showReplies && (
            <div className="mt-1.5 flex-1 w-px bg-border/70" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="select-none" {...holdHandlers(comment, comment.id)}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">{n}</span>
              <span className="text-xs text-faint">· {timeAgo(comment.created_at)}</span>
            </div>
            {isGifBody(comment.body) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={comment.body} alt="GIF" className="mt-1 max-w-[200px] rounded-xl" />
            ) : (
              <p className="mt-0.5 text-sm text-foreground/90">{comment.body}</p>
            )}
          </div>

          {/* Actions */}
          <div className="mt-1.5 flex items-center gap-4">
            <button type="button" onClick={() => onHype(comment)}
              className={`flex items-center gap-1 text-xs font-medium ${comment.hyped ? "text-hype" : "text-faint hover:text-muted"}`}>
              <Star size={13} fill={comment.hyped ? "currentColor" : "none"} />
              {comment.localHypeCount > 0 && formatCount(comment.localHypeCount)}
            </button>
            {uname && (
              <button type="button" onClick={() => onReply(comment.id, uname)}
                className="text-xs font-medium text-faint hover:text-muted">
                Reply
              </button>
            )}
            {!isOwnComment && (
              <button type="button" onClick={() => onReport(comment.id)}
                className={`flex items-center gap-0.5 text-xs font-medium ${comment.reported ? "text-accent" : "text-faint hover:text-muted"}`}>
                {comment.reported ? <Check size={11} /> : <Flag size={11} />}
                {comment.reported ? "Reported" : "Report"}
              </button>
            )}
            {isOwnComment && (
              <button type="button" onClick={() => onDelete(comment.id)}
                className="flex items-center gap-0.5 text-xs font-medium text-danger">
                <Trash2 size={11} /> Delete
              </button>
            )}
          </div>

          {/* Show/hide replies toggle */}
          {hasReplies && (
            <button
              type="button"
              onClick={() => onToggleReplies(comment.id)}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${comment.showReplies ? "rotate-180" : "rotate-0"}`}
              />
              {comment.showReplies
                ? "Hide replies"
                : `${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}`}
            </button>
          )}
        </div>
      </div>

      {/* Replies -- indented with left border */}
      {hasReplies && comment.showReplies && (
        <div className="ml-[17px] mt-1.5 border-l-2 border-border/60 pl-5">
          <div className="flex flex-col gap-4">
            {comment.replies.map((reply) => {
              const rn = reply.profiles?.display_name ?? reply.profiles?.username ?? "User";
              const runame = reply.profiles?.username;
              const rhue = reply.profiles?.avatar_hue ?? 280;
              return (
                <div key={reply.id} className="flex gap-2.5">
                  <button
                    type="button"
                    aria-label={`View ${rn}'s photo`}
                    onClick={() => { const src = reply.profiles?.avatar_url; if (src) setZoomSrc(src); }}
                    className="shrink-0 active:scale-95 transition-transform"
                  >
                    <Avatar name={rn} hue={rhue} size={28} src={reply.profiles?.avatar_url ?? undefined} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="select-none" {...holdHandlers(reply, comment.id)}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{rn}</span>
                        <span className="text-xs text-faint">· {timeAgo(reply.created_at)}</span>
                      </div>
                      {isGifBody(reply.body) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={reply.body} alt="GIF" className="mt-1 max-w-[180px] rounded-xl" />
                      ) : (
                        <p className="mt-0.5 text-sm text-foreground/90">{reply.body}</p>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-4">
                      <button type="button" onClick={() => onHype(reply)}
                        className={`flex items-center gap-1 text-xs font-medium ${reply.hyped ? "text-hype" : "text-faint hover:text-muted"}`}>
                        <Star size={12} fill={reply.hyped ? "currentColor" : "none"} />
                        {reply.localHypeCount > 0 && formatCount(reply.localHypeCount)}
                      </button>
                      {runame && (
                        <button type="button" onClick={() => onReply(comment.id, runame)}
                          className="text-xs font-medium text-faint hover:text-muted">
                          Reply
                        </button>
                      )}
                      <button type="button" onClick={() => onReport(reply.id)}
                        className={`flex items-center gap-0.5 text-xs font-medium ${reply.reported ? "text-accent" : "text-faint hover:text-muted"}`}>
                        {reply.reported ? <Check size={11} /> : <Flag size={11} />}
                        {reply.reported ? "Reported" : "Report"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
    {zoomSrc && <ZoomViewer src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </>
  );
}
