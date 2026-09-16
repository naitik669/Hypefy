"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { NavHoldMenu, type HoldAction } from "@/components/layout/NavHoldMenu";

/**
 * Hold the share button to send without opening anything: the four people you
 * send posts to most, as faces, picked by sliding the thumb to one and
 * letting go.
 *
 * It is the nav bar's own gesture, not a lookalike — NavHoldMenu, the same
 * component the chat tab raises its recent conversations with. Before this it
 * had its own hold: the row appeared and then waited to be TAPPED, so the one
 * gesture in the app that means "hold, slide, release" meant something else
 * here, and the thumb that had already travelled to a face had to lift and
 * come back down on it.
 *
 * Faces only, for the same reason the chat stack is faces only: you pick
 * without reading. Copying a link is a tap away in the full sheet, which is
 * what a plain tap still opens.
 */

export type ShareTarget = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

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
  const supabase = createClient();
  const toast = useToast();
  const [actions, setActions] = useState<HoldAction[]>([]);
  /** Guards against sending the same post twice on a double pick. */
  const sent = useRef<Set<string>>(new Set());

  const send = useCallback(
    async (t: ShareTarget) => {
      const name = t.display_name ?? t.username ?? "them";
      if (sent.current.has(t.id)) return;
      sent.current.add(t.id);

      const { data: convId, error } = await supabase.rpc("get_or_create_dm", {
        p_other: t.id,
      });
      if (error || !convId) {
        sent.current.delete(t.id);
        toast("Couldn't send", "error");
        return;
      }
      const { error: sendErr } =
        targetType === "shot"
          ? await supabase.rpc("send_message", {
              p_conversation_id: convId,
              p_body: undefined,
              p_kind: "shot",
              p_post_id: undefined,
              p_shot_id: postId,
              p_reply_to_id: undefined,
            })
          : await supabase.rpc("send_message", {
              p_conversation_id: convId,
              p_body: undefined,
              p_kind: "post",
              p_post_id: postId,
              p_reply_to_id: undefined,
            });
      if (sendErr) {
        sent.current.delete(t.id);
        toast("Couldn't send", "error");
        return;
      }
      // The stack is already gone by now — the send happens after you let go —
      // so the toast is the whole confirmation, and it names who got it.
      haptics.success();
      forgetShareTargets();
      toast(`Sent to ${name}`, "success");
    },
    [postId, targetType, supabase, toast],
  );

  /**
   * Fetch the faces at touch-down, which buys the hold's own delay before the
   * stack is on screen. A session that never holds never pays for the query.
   */
  const arm = useCallback(async () => {
    const targets = await loadShareTargets();
    setActions(
      targets.map((t) => {
        const name = t.display_name ?? t.username ?? "User";
        return {
          key: t.id,
          label: name,
          avatar: { name, hue: t.avatar_hue ?? 280, src: t.avatar_url },
          onSelect: () => void send(t),
        };
      }),
    );
  }, [send]);

  return (
    <NavHoldMenu
      actions={actions}
      label="Send to"
      // The feed scrolls under this button, unlike the nav bar it borrows the
      // gesture from, so the page keeps its own touches until the stack opens.
      touchAction="pan-y"
      onArm={() => void arm()}
    >
      <button type="button" aria-label={label} className={className} onClick={onOpenSheet}>
        {children}
      </button>
    </NavHoldMenu>
  );
}
