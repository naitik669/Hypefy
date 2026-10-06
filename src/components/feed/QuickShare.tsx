"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { NavHoldMenu, type HoldAction } from "@/components/layout/NavHoldMenu";

/**
 * Hold the share button to send without opening anything: the four people or
 * group chats you interact with most, as faces, picked by sliding the thumb to
 * one and letting go. The face you land on shows a check before the card
 * goes, and a last tile opens the full share sheet.
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

/** A person, or a group chat you are in. `id` is a user's for one and a conversation's for the other. */
export type ShareTarget = {
  kind: "person" | "group";
  id: string;
  name: string;
  avatar_hue: number | null;
  avatar_url: string | null;
};

/**
 * How many faces the row holds, before the Share tile.
 *
 * Four, not six: the row hangs off the share button rather than spanning the
 * screen, and past four the card reaches the far edge and has to be pulled
 * back — which puts the first face somewhere other than under the thumb that
 * is already resting on the button.
 */
const TARGETS = 4;

/** Resolved once per session: the list barely moves and a hold must feel instant. */
let cached: ShareTarget[] | null = null;

/**
 * The same ranking the share sheet opens on (share_suggestions): the people
 * and group chats you actually interact with, best first. This row used to
 * ask a different, older question, so holding the button offered faces the
 * sheet one tap away would not, and never a group.
 */
export async function loadShareTargets(): Promise<ShareTarget[]> {
  if (cached) return cached;
  const supabase = createClient();
  const { data } = await supabase.rpc("share_suggestions", { p_limit: TARGETS });
  cached = (data ?? []).map((r) => ({
    kind: r.kind === "group" ? ("group" as const) : ("person" as const),
    id: r.id,
    name: r.name ?? r.username ?? (r.kind === "group" ? "Group" : "User"),
    avatar_hue: r.avatar_hue,
    avatar_url: r.avatar_url,
  }));
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
  align = "start",
  slide,
  children,
}: {
  postId: string;
  targetType?: "post" | "shot";
  /** A plain tap: the full share sheet, as before. */
  onOpenSheet: () => void;
  className?: string;
  label?: string;
  /**
   * Which way the row unrolls from the button. "start" for a button on the
   * left of a post's action row; "end" for the Shots rail, which is itself
   * against the right edge — a row running right from there would be off the
   * screen before it began.
   */
  align?: "start" | "end";
  /**
   * Which photo of a post with several is on screen, so the chat shows the
   * one that was shared rather than the first. Left out for anything else.
   */
  slide?: number;
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
      const name = t.name;
      if (sent.current.has(t.id)) return;
      sent.current.add(t.id);

      // A group is already a conversation; a person needs theirs found or made.
      let convId: string | null = t.kind === "group" ? t.id : null;
      if (!convId) {
        const { data, error } = await supabase.rpc("get_or_create_dm", { p_other: t.id });
        convId = error || !data ? null : (data as string);
      }
      if (!convId) {
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
              p_metadata: slide === undefined ? undefined : { slide },
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
    [postId, targetType, slide, supabase, toast],
  );

  /**
   * Fetch the faces at touch-down, which buys the hold's own delay before the
   * stack is on screen. A session that never holds never pays for the query.
   */
  const arm = useCallback(async () => {
    const targets = await loadShareTargets();
    setActions([
      ...targets.map((t) => {
        const name = t.name;
        return {
          key: `${t.kind}-${t.id}`,
          label: name,
          avatar: { name, hue: t.avatar_hue ?? (t.kind === "group" ? 160 : 280), src: t.avatar_url },
          onSelect: () => void send(t),
          confirm: true,
        };
      }),
      // Everyone else, and every other way to share, one slide further.
      { key: "more", label: "Share", icon: Share2, onSelect: onOpenSheet },
    ]);
  }, [send, onOpenSheet]);

  // Faces ready before the first hold: once per session, when the browser is
  // idle, so the row opens full rather than a beat after the thumb lands.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const run = () => void arm();
    if (idle) idle(run);
    else setTimeout(run, 1200);
  }, [arm]);

  return (
    <NavHoldMenu
      actions={actions}
      label="Send to"
      // A card just above the button, running out from it the way the button
      // has room. A column would cover the post you are sharing, and drawn
      // inside the feed it would sit under the veil and be blurred with it.
      layout="row"
      align={align}
      // The feed scrolls under this button, unlike the nav bar it borrows the
      // gesture from, so the page keeps its own touches until the stack opens.
      touchAction="pan-y"
      // Quicker than the nav bar's hold: this one lives in the feed, where a
      // long press competes with the thumb getting bored and scrolling.
      holdMs={260}
      onArm={() => void arm()}
    >
      <button type="button" aria-label={label} className={className} onClick={onOpenSheet}>
        {children}
      </button>
    </NavHoldMenu>
  );
}
