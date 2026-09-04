"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Star,
  Send,
  Loader2,
  Flag,
  Check,
  ChevronDown,
  Trash2,
  CornerUpLeft,
  Copy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FloatingMenu, MenuItem } from "@/components/ui/FloatingMenu";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { Avatar } from "@/components/ui/Avatar";
import { ZoomViewer } from "@/components/ui/ZoomViewer";
import { GifPicker } from "@/components/messages/GifPicker";
import { formatCount } from "@/lib/format";
import {
  useMentionHashtag,
  applySuggestion,
  SuggestionDropdown,
} from "@/components/ui/MentionHashtagPicker";
import { useToast } from "@/components/ui/ToastProvider";
import { scheduleUndoable } from "@/lib/undoable";

/**
 * Comments.
 *
 * Rebuilt because typing in it was unusable. The cause was structural, not a
 * slow query: the draft text lived in the same component as the list, so
 * every keystroke re-rendered every comment, every avatar and every GIF in
 * the thread. On a thread of any size that is a re-render per character.
 *
 * Three rules hold that fixed, and breaking any one brings the lag back:
 *
 *  1. The composer owns its own text. Nothing above it re-renders while
 *     typing — it reports a finished comment, not a keystroke.
 *  2. Rows are memoised, so a state change touches only the rows that
 *     actually changed. That only works while the handlers passed to them
 *     keep their identity, hence the useCallbacks with no shifting deps.
 *  3. Replies render through the SAME row component as their parents. They
 *     used to be a second, near-identical copy of the markup, which is how
 *     they drifted apart — replies quietly had no delete.
 */

const isGifBody = (body: string) => body.startsWith("https://");

/* --- Types ---------------------------------------------------------------- */
type Profile = {
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url?: string | null;
};

type Node = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  hyped: boolean;
  hypeCount: number;
  reported: boolean;
  profiles: Profile | null;
};

/* --- Helpers -------------------------------------------------------------- */
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * Roots in posting order, with each root's replies attached.
 *
 * Flat state rather than a tree in state: a tree has to be walked and cloned
 * to change one node, which is how a single hype ended up re-rendering the
 * whole thread. A flat array replaces exactly one element, every other node
 * keeps its identity, and the memoised rows below skip.
 */
export function threadOf(items: Node[]): { root: Node; replies: Node[] }[] {
  const byId = new Map(items.map((c) => [c.id, c]));

  /**
   * The top-level comment this one belongs under.
   *
   * Walked all the way up rather than taking parent_id at face value. The
   * thread is one level deep on screen, but nothing stops a reply pointing
   * at another reply — the old code nested those a second level down and
   * then rendered only one level, so a reply to a reply was written,
   * stored, and never seen again by anyone.
   *
   * A reply whose parent is missing (deleted, or never loaded) becomes its
   * own root rather than being dropped, for the same reason.
   */
  function rootOf(c: Node): Node {
    let cur = c;
    const seen = new Set<string>([cur.id]);
    while (cur.parent_id) {
      const parent = byId.get(cur.parent_id);
      // Missing parent, or a cycle in the data — stop rather than loop.
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      cur = parent;
    }
    return cur;
  }

  const replies = new Map<string, Node[]>();
  const roots: Node[] = [];

  for (const c of items) {
    const root = rootOf(c);
    if (root.id === c.id) {
      roots.push(c);
      continue;
    }
    const list = replies.get(root.id);
    if (list) list.push(c);
    else replies.set(root.id, [c]);
  }
  return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
}

/* --- Main component ------------------------------------------------------- */
export function CommentsSheet({
  open,
  onClose,
  postId,
  postOwnerId,
  currentUserId,
  onCountChange,
  targetType = "post",
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  postOwnerId: string;
  currentUserId: string;
  onCountChange?: (count: number) => void;
  /** Whether comments belong to a post (default) or a shot/reel. */
  targetType?: "post" | "shot";
}) {
  const supabase = useMemo(() => createClient(), []);
  const showToast = useToast();

  const [items, setItems] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [actionOn, setActionOn] = useState<{
    node: Node;
    threadId: string;
    x: number;
    y: number;
  } | null>(null);

  const threads = useMemo(() => threadOf(items), [items]);

  /* --- Load ------------------------------------------------------------- */
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from("comments")
        .select(
          "id, user_id, body, created_at, parent_id, hype_count, profiles(display_name, username, avatar_hue, avatar_url)"
        )
        .eq(targetType === "shot" ? "shot_id" : "post_id", postId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (!live) return;
      const rows = data ?? [];

      // Which of these the viewer has already hyped. Kept as a second query
      // because the star has to be right on open — an empty star on a comment
      // you hyped makes the next tap un-hype it, which looks like the button
      // is broken.
      let hyped = new Set<string>();
      if (currentUserId && rows.length > 0) {
        const { data: hypeRows } = await supabase
          .from("hypes")
          .select("target_id")
          .eq("user_id", currentUserId)
          .eq("target_type", "comment")
          .in(
            "target_id",
            rows.map((c: { id: string }) => c.id)
          );
        if (!live) return;
        hyped = new Set(
          (hypeRows ?? []).map((h: { target_id: string }) => h.target_id)
        );
      }

      setItems(
        rows.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          user_id: c.user_id as string,
          body: c.body as string,
          created_at: c.created_at as string,
          parent_id: (c.parent_id as string | null) ?? null,
          hyped: hyped.has(c.id as string),
          hypeCount: (c.hype_count as number) ?? 0,
          reported: false,
          profiles: Array.isArray(c.profiles)
            ? ((c.profiles[0] as Profile) ?? null)
            : ((c.profiles as Profile) ?? null),
        }))
      );
      setLoading(false);
    })();

    return () => {
      live = false;
    };
  }, [open, postId, targetType, currentUserId, supabase]);

  useEffect(() => {
    if (!open) {
      setReplyTo(null);
      setActionOn(null);
    }
  }, [open]);

  // Keep the parent's badge honest — replies count too.
  useEffect(() => {
    if (open) onCountChange?.(items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, open]);

  /* --- Mutations -------------------------------------------------------- */
  /** Replace one node, leaving every other object identity untouched. */
  const patch = useCallback((id: string, fn: (n: Node) => Node) => {
    setItems((prev) => prev.map((n) => (n.id === id ? fn(n) : n)));
  }, []);

  const hype = useCallback(
    async (node: Node) => {
      if (!currentUserId) return;
      const flip = (n: Node) => ({
        ...n,
        hyped: !n.hyped,
        hypeCount: n.hypeCount + (n.hyped ? -1 : 1),
      });
      patch(node.id, flip);
      const { error } = await supabase.rpc("toggle_hype", {
        p_target_type: "comment",
        p_target_id: node.id,
        p_owner_id: undefined,
      });
      if (error) {
        patch(node.id, flip); // undo
        showToast(error.message ?? "Couldn't hype that comment.");
      }
    },
    [currentUserId, patch, supabase, showToast]
  );

  const remove = useCallback(
    (id: string) => {
      // Snapshot first: the comment and anything hanging off it leave the
      // list immediately, and putting them back has to be exact — including
      // where in the order they were.
      let restore: Node[] = [];
      setItems((prev) => {
        restore = prev;
        return prev.filter((n) => n.id !== id && n.parent_id !== id);
      });

      const cancel = scheduleUndoable(async () => {
        // .select() is load-bearing: without it the update runs
        // return=minimal, and an update matching NO rows is not an error —
        // so an RLS refusal arrived as success, the comment left the list,
        // and came back on reopen. Asking for the row makes "did anything
        // change" answerable.
        const { data, error } = await supabase
          .from("comments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .select("id");

        if (error || !data || data.length === 0) {
          showToast(error?.message ?? "Couldn't delete that comment.");
          setItems(restore);
        }
      });

      showToast("Comment deleted", "plain", {
        label: "Undo",
        onClick: () => {
          cancel();
          setItems(restore);
        },
      });
    },
    [supabase, showToast]
  );

  const toggleReplies = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startReply = useCallback((id: string, username: string) => {
    setReplyTo({ id, username });
  }, []);

  const report = useCallback(
    (id: string) => {
      if (!currentUserId) return;
      setReportTarget(id);
    },
    [currentUserId]
  );

  const longPress = useCallback(
    (node: Node, threadId: string, x: number, y: number) =>
      setActionOn({ node, threadId, x, y }),
    []
  );

  const zoom = useCallback((src: string) => setZoomSrc(src), []);

  /* --- Posting ---------------------------------------------------------- */
  /**
   * Returns whether it worked, so the composer knows whether to clear. It
   * used to clear unconditionally, which threw away what you had written on
   * every failure.
   */
  const submit = useCallback(
    async (body: string): Promise<boolean> => {
      const parentId = replyTo?.id;
      const { data, error } =
        targetType === "shot"
          ? await supabase.rpc("create_shot_comment", {
              p_shot_id: postId,
              p_body: body,
              p_owner_id: postOwnerId,
              p_parent_id: parentId ?? undefined,
            })
          : await supabase.rpc("create_comment", {
              p_post_id: postId,
              p_body: body,
              p_owner_id: postOwnerId,
              p_parent_id: parentId ?? undefined,
            });

      if (error || !data) {
        // Postgres already names the cause — a rate limit reads very
        // differently from a dead session. One catch-all sentence made every
        // failure look the same and none of them diagnosable.
        showToast(error?.message ?? "Couldn't post that.");
        return false;
      }

      const { data: row } = await supabase
        .from("comments")
        .select(
          "id, user_id, body, created_at, parent_id, hype_count, profiles(display_name, username, avatar_hue, avatar_url)"
        )
        .eq("id", data)
        .single();

      if (row) {
        const r = row as Record<string, unknown>;
        setItems((prev) => [
          ...prev,
          {
            id: r.id as string,
            user_id: r.user_id as string,
            body: r.body as string,
            created_at: r.created_at as string,
            parent_id: (r.parent_id as string | null) ?? null,
            hyped: false,
            hypeCount: 0,
            reported: false,
            profiles: Array.isArray(r.profiles)
              ? ((r.profiles[0] as Profile) ?? null)
              : ((r.profiles as Profile) ?? null),
          },
        ]);
        if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
      }

      setReplyTo(null);
      return true;
    },
    [replyTo, targetType, postId, postOwnerId, supabase, showToast]
  );

  const actionNode = actionOn?.node;

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={`Comments · ${items.length}`}
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={22} className="animate-spin text-muted" />
          </div>
        ) : threads.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">
            Quiet so far. Drop the first take.
          </p>
        ) : (
          <div className="flex flex-col gap-5 pb-3 pt-1">
            {threads.map(({ root, replies }) => (
              <Thread
                key={root.id}
                root={root}
                replies={replies}
                open={expanded.has(root.id)}
                currentUserId={currentUserId}
                onHype={hype}
                onReply={startReply}
                onReport={report}
                onToggleReplies={toggleReplies}
                onLongPress={longPress}
                onZoom={zoom}
              />
            ))}
          </div>
        )}

        <Composer
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSubmit={submit}
        />
      </BottomSheet>

      {reportTarget && currentUserId && (
        <ReportSheet
          open
          onClose={() => setReportTarget(null)}
          targetType="comment"
          targetId={reportTarget}
          currentUserId={currentUserId}
          onReported={() =>
            patch(reportTarget, (n) => ({ ...n, reported: true }))
          }
        />
      )}

      {zoomSrc && (
        <ZoomViewer src={zoomSrc} onClose={() => setZoomSrc(null)} />
      )}

      {/* Long-press actions, anchored at the press point. Portalled to
          <body>: the sheet's entrance transform is a containing block, so a
          fixed menu inside it anchors to the sheet rather than the screen. */}
      {actionOn &&
        actionNode &&
        typeof document !== "undefined" &&
        createPortal(
          <FloatingMenu
            open
            onClose={() => setActionOn(null)}
            origin="top-left"
            className="fixed w-44"
            zIndex={220}
            style={{
              // Clamped so a press near the bottom or right edge does not
              // open the menu off the screen.
              left: Math.min(
                actionOn.x,
                (typeof window !== "undefined" ? window.innerWidth : 400) - 192
              ),
              top: Math.min(
                actionOn.y,
                (typeof window !== "undefined" ? window.innerHeight : 800) - 210
              ),
            }}
          >
            {actionNode.profiles?.username && (
              <MenuItem
                icon={CornerUpLeft}
                label="Reply"
                onClick={() => {
                  startReply(
                    actionOn.threadId,
                    actionNode.profiles!.username!
                  );
                  setActionOn(null);
                }}
              />
            )}
            {!isGifBody(actionNode.body) && (
              <MenuItem
                icon={Copy}
                label="Copy"
                onClick={() => {
                  navigator.clipboard?.writeText(actionNode.body).catch(() => {});
                  setActionOn(null);
                }}
              />
            )}
            {actionNode.user_id !== currentUserId && (
              <MenuItem
                icon={Flag}
                label="Report"
                onClick={() => {
                  report(actionNode.id);
                  setActionOn(null);
                }}
              />
            )}
            {actionNode.user_id === currentUserId && (
              <MenuItem
                icon={Trash2}
                label="Delete"
                danger
                onClick={() => {
                  void remove(actionNode.id);
                  setActionOn(null);
                }}
              />
            )}
          </FloatingMenu>,
          document.body
        )}
    </>
  );
}

/* --- Composer ------------------------------------------------------------- */
/**
 * Owns the draft.
 *
 * This is the whole performance fix. While this text lived in the sheet,
 * every character re-rendered every comment in the thread; here, a keystroke
 * re-renders one input.
 */
function Composer({
  replyTo,
  onCancelReply,
  onSubmit,
}: {
  replyTo: { id: string; username: string } | null;
  onCancelReply: () => void;
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [posting, setPosting] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const { suggestions, reset: resetPicker } = useMentionHashtag(text, cursor);

  // Starting a reply seeds the mention and focuses, so the next thing typed
  // is the reply itself.
  useEffect(() => {
    if (!replyTo) return;
    setText(`@${replyTo.username} `);
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [replyTo]);

  async function send() {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    const ok = await onSubmit(body);
    setPosting(false);
    // Only clear on success. Clearing regardless threw away what you wrote
    // every time the post failed, which is exactly when you want it back.
    if (ok) setText("");
  }

  async function sendGif(url: string) {
    if (posting) return;
    setPosting(true);
    const ok = await onSubmit(url);
    setPosting(false);
    // Keep the picker open on failure: closing it meant re-opening and
    // re-finding the same GIF to try again.
    setGifOpen(!ok);
  }

  return (
    <div className="sticky bottom-0 -mx-5 border-t border-border bg-elevated px-5 pb-3 pt-2">
      {gifOpen && (
        <div className="mb-2">
          <GifPicker onSelect={sendGif} />
        </div>
      )}

      {replyTo && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted">
          <CornerUpLeft size={13} className="text-faint" />
          Replying to{" "}
          <span className="font-semibold text-foreground">
            @{replyTo.username}
          </span>
          <button
            type="button"
            onClick={() => {
              onCancelReply();
              setText("");
            }}
            className="ml-auto text-faint hover:text-muted"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setGifOpen((v) => !v)}
          aria-pressed={gifOpen}
          className={`flex h-9 items-center justify-center rounded-lg px-2 text-[11px] font-black tracking-wide transition-colors ${
            gifOpen
              ? "bg-accent text-accent-ink"
              : "bg-surface text-muted hover:text-foreground"
          }`}
        >
          GIF
        </button>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCursor(e.target.selectionStart ?? 0);
            }}
            onSelect={(e) =>
              setCursor((e.target as HTMLInputElement).selectionStart ?? 0)
            }
            onBlur={() => setTimeout(resetPicker, 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) void send();
            }}
            placeholder={
              replyTo ? `Reply to @${replyTo.username}...` : "Add a comment..."
            }
            className="h-10 w-full rounded-pill bg-surface px-4 text-sm outline-none placeholder:text-faint focus:border-white/25"
          />
          <SuggestionDropdown
            suggestions={suggestions}
            onSelect={(s) => {
              const { newValue, newCursor } = applySuggestion(text, cursor, s);
              setText(newValue);
              setCursor(newCursor);
              setTimeout(
                () => inputRef.current?.setSelectionRange(newCursor, newCursor),
                0
              );
              resetPicker();
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || posting}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40"
        >
          {posting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

/* --- Thread --------------------------------------------------------------- */
type RowHandlers = {
  onHype: (n: Node) => void;
  onReply: (threadId: string, username: string) => void;
  onReport: (id: string) => void;
  onLongPress: (n: Node, threadId: string, x: number, y: number) => void;
  onZoom: (src: string) => void;
};

const Thread = memo(function Thread({
  root,
  replies,
  open,
  currentUserId,
  onToggleReplies,
  ...handlers
}: {
  root: Node;
  replies: Node[];
  open: boolean;
  currentUserId: string;
  onToggleReplies: (id: string) => void;
} & RowHandlers) {
  return (
    <div>
      <Row
        node={root}
        threadId={root.id}
        currentUserId={currentUserId}
        {...handlers}
      />

      {replies.length > 0 && (
        <button
          type="button"
          onClick={() => onToggleReplies(root.id)}
          className="mt-2 ml-[52px] flex items-center gap-1.5 text-xs font-semibold text-accent"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
          {open
            ? "Hide replies"
            : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        </button>
      )}

      {open && replies.length > 0 && (
        <div className="mt-2 ml-[17px] flex flex-col gap-4 border-l-2 border-border/60 pl-5">
          {replies.map((r) => (
            <Row
              key={r.id}
              node={r}
              threadId={root.id}
              compact
              currentUserId={currentUserId}
              {...handlers}
            />
          ))}
        </div>
      )}
    </div>
  );
});

/* --- One comment ---------------------------------------------------------- */
/** Hold to act. Long enough not to fire while scrolling the thread. */
const HOLD_MS = 400;

const Row = memo(function Row({
  node,
  threadId,
  compact = false,
  currentUserId,
  onHype,
  onReply,
  onReport,
  onLongPress,
  onZoom,
}: {
  node: Node;
  threadId: string;
  compact?: boolean;
  currentUserId: string;
} & RowHandlers) {
  const name = node.profiles?.display_name ?? node.profiles?.username ?? "User";
  const username = node.profiles?.username;
  const hue = node.profiles?.avatar_hue ?? 280;
  const isOwn = node.user_id === currentUserId;
  const size = compact ? 28 : 34;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const point = useRef({ x: 0, y: 0 });

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => cancel, []);

  return (
    <div className="flex gap-3">
      <button
        type="button"
        aria-label={`View ${name}'s photo`}
        onClick={() => {
          const src = node.profiles?.avatar_url;
          if (src) onZoom(src);
        }}
        className="shrink-0 transition-transform active:scale-95"
      >
        <Avatar
          name={name}
          hue={hue}
          size={size}
          src={node.profiles?.avatar_url ?? undefined}
        />
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="select-none"
          onPointerDown={(e) => {
            point.current = { x: e.clientX, y: e.clientY };
            cancel();
            timer.current = setTimeout(() => {
              timer.current = null;
              onLongPress(node, threadId, point.current.x, point.current.y);
            }, HOLD_MS);
          }}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onPointerMove={(e) => {
            // Only a real drag disarms it. Cancelling on ANY move meant the
            // tremor in a resting thumb could stop the hold from ever firing.
            if (
              Math.abs(e.clientX - point.current.x) > 8 ||
              Math.abs(e.clientY - point.current.y) > 8
            )
              cancel();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onLongPress(node, threadId, e.clientX, e.clientY);
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{name}</span>
            <span className="text-xs text-faint">
              · {timeAgo(node.created_at)}
            </span>
          </div>

          {isGifBody(node.body) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={node.body}
              alt="GIF"
              loading="lazy"
              decoding="async"
              className="mt-1 max-w-[180px] rounded-xl bg-surface"
            />
          ) : (
            <p className="mt-0.5 text-sm break-words text-foreground/90">
              {node.body}
            </p>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => onHype(node)}
            className={`flex items-center gap-1 text-xs font-medium ${
              node.hyped ? "text-hype" : "text-faint hover:text-muted"
            }`}
          >
            <Star size={13} fill={node.hyped ? "currentColor" : "none"} />
            {node.hypeCount > 0 && formatCount(node.hypeCount)}
          </button>

          {username && (
            <button
              type="button"
              onClick={() => onReply(threadId, username)}
              className="text-xs font-medium text-faint hover:text-muted"
            >
              Reply
            </button>
          )}

          {!isOwn && (
            <button
              type="button"
              onClick={() => onReport(node.id)}
              className={`flex items-center gap-0.5 text-xs font-medium ${
                node.reported ? "text-accent" : "text-faint hover:text-muted"
              }`}
            >
              {node.reported ? <Check size={11} /> : <Flag size={11} />}
              {node.reported ? "Reported" : "Report"}
            </button>
          )}
          {/* Delete lives only in the long-press menu — a destructive action
              should not sit one stray tap from Reply on every comment you
              own. Replies get it too now, which the old duplicated markup
              had quietly missed. */}
        </div>
      </div>
    </div>
  );
});
