"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/**
 * Hold the share button to send without opening anything: the four people
 * you send posts to most, and a copy-link button.
 *
 * A tap still opens the full share sheet. The row is the same everywhere a
 * post or Shot can be shared — feed, peek, Shots — so the gesture means one
 * thing in the whole app.
 */

export type ShareTarget = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

const HOLD_MS = 350;
const HOLD_SLOP_PX = 10;

/** Resolved once per session: the list barely moves and a hold must feel instant. */
let cached: ShareTarget[] | null = null;

export async function loadShareTargets(): Promise<ShareTarget[]> {
  if (cached) return cached;
  const supabase = createClient();
  const { data } = await supabase.rpc("top_share_targets", { p_limit: 4 });
  cached = (data ?? []) as ShareTarget[];
  return cached;
}

/** After a send, the order is stale; let it rebuild next time. */
export function forgetShareTargets() {
  cached = null;
}

export function ShareButton({
  postId,
  targetType = "post",
  onOpenSheet,
  className = "",
  label = "Share",
  children,
}: {
  postId: string;
  targetType?: "post" | "shot";
  /** A plain tap: the full share sheet, as before. */
  onOpenSheet: () => void;
  className?: string;
  label?: string;
  /** The icon, so each surface keeps its own size and colour. */
  children: React.ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ShareTarget[] | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  async function openQuick() {
    held.current = true;
    haptics.select();
    setOpen(true);
    setTargets(await loadShareTargets());
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        className={className}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          held.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          clear();
          timer.current = setTimeout(() => void openQuick(), HOLD_MS);
        }}
        onPointerMove={(e) => {
          if (
            Math.abs(e.clientX - start.current.x) > HOLD_SLOP_PX ||
            Math.abs(e.clientY - start.current.y) > HOLD_SLOP_PX
          )
            clear();
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // The hold ends in a click; it must not also open the sheet.
          if (held.current) {
            e.preventDefault();
            held.current = false;
            return;
          }
          onOpenSheet();
        }}
      >
        {children}
      </button>

      {open && (
        <QuickShareRow
          anchorRef={btn}
          postId={postId}
          targetType={targetType}
          targets={targets}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function QuickShareRow({
  anchorRef,
  postId,
  targetType,
  targets,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  postId: string;
  targetType: "post" | "shot";
  targets: ShareTarget[] | null;
  onClose: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useOverlayBackButton(true, onClose);

  const path = targetType === "shot" ? `/shots/${postId}` : `/p/${postId}`;
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : `https://app.hypefy.chat${path}`;

  // Above the button, kept on screen at either edge. Measured after mount:
  // the button's position is not knowable while rendering.
  const width = 300;
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const box = anchorRef.current?.getBoundingClientRect();
    if (!box) return;
    setPos({
      left: Math.min(Math.max(box.left + box.width / 2 - width / 2, 8), Math.max(8, window.innerWidth - width - 8)),
      bottom: Math.max(window.innerHeight - box.top + 10, 8),
    });
  }, [anchorRef]);

  async function send(t: ShareTarget) {
    if (sending || done.has(t.id)) return;
    setSending(t.id);
    const { data: convId, error } = await supabase.rpc("get_or_create_dm", { p_other: t.id });
    if (error || !convId) {
      setSending(null);
      toast("Couldn't send", "error");
      return;
    }
    const { error: sendErr } =
      targetType === "shot"
        ? await supabase.rpc("send_message", {
            p_conversation_id: convId, p_body: undefined, p_kind: "shot",
            p_post_id: undefined, p_shot_id: postId, p_reply_to_id: undefined,
          })
        : await supabase.rpc("send_message", {
            p_conversation_id: convId, p_body: undefined, p_kind: "post",
            p_post_id: postId, p_reply_to_id: undefined,
          });
    setSending(null);
    if (sendErr) {
      toast("Couldn't send", "error");
      return;
    }
    haptics.success();
    forgetShareTargets();
    setDone((prev) => new Set(prev).add(t.id));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      haptics.select();
      setTimeout(onClose, 700);
    } catch {
      toast("Couldn't copy the link", "error");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[210]"
      onClick={onClose}
      onPointerUp={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Send to"
    >
      <div
        className="absolute flex items-end gap-3 rounded-3xl border border-white/10 bg-elevated/95 px-3.5 py-3 shadow-2xl backdrop-blur-xl"
        style={{ left: pos?.left ?? 8, bottom: pos?.bottom ?? 80, width, opacity: pos ? 1 : 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {targets === null ? (
          <span className="flex h-[58px] w-full items-center justify-center text-muted">
            <Loader2 size={18} className="animate-spin" />
          </span>
        ) : targets.length === 0 ? (
          <span className="flex h-[58px] w-full items-center justify-center px-2 text-center text-xs text-muted">
            Nobody to send to yet — tap share to find people.
          </span>
        ) : (
          <>
            {targets.map((t) => {
              const name = t.display_name ?? t.username ?? "User";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void send(t)}
                  aria-label={`Send to ${name}`}
                  className="flex w-[52px] shrink-0 flex-col items-center gap-1 transition active:scale-95"
                >
                  <span className="relative">
                    <Avatar name={name} hue={t.avatar_hue ?? 280} size={44} src={t.avatar_url ?? undefined} className="rounded-2xl" />
                    {(sending === t.id || done.has(t.id)) && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-accent">
                        {done.has(t.id) ? <Check size={20} strokeWidth={3} /> : <Loader2 size={18} className="animate-spin" />}
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate text-center text-[10px] text-muted">{name.split(" ")[0]}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => void copy()}
              aria-label="Copy link"
              className="flex w-[52px] shrink-0 flex-col items-center gap-1 transition active:scale-95"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-foreground">
                {copied ? <Check size={20} strokeWidth={3} className="text-accent" /> : <Link2 size={19} />}
              </span>
              <span className="w-full truncate text-center text-[10px] text-muted">{copied ? "Copied" : "Link"}</span>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
