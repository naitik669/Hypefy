"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import type { DiaryEntry } from "@/lib/diary";

export type ReplyStatus = "idle" | "sending" | "sent" | "error";

/**
 * Reacting to and replying to someone's Diary — the same two actions on the
 * card in the list and on the full-screen page, so both behave identically.
 *
 * A reaction lands on the Diary and notifies its owner once (react_to_note
 * only notifies on the first reaction, so changing your mind is quiet). A
 * reply goes to your DMs, prefixed so the thread reads as an answer rather
 * than a line out of nowhere — the same two RPCs a Show reply uses.
 *
 * `mine` and `onReacted` let a parent own the reaction, so the emoji you
 * picked on a card is already picked when that Diary opens full-screen.
 */
export function useDiaryActions({
  entry,
  mine,
  onReacted,
}: {
  entry: DiaryEntry;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
}) {
  const [status, setStatus] = useState<ReplyStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function react(emoji: string) {
    const supabase = createClient();
    haptics.tap();
    const previous = mine;
    const next = previous === emoji ? null : emoji;
    onReacted(entry.userId, next); // optimistic; put back if the server says no
    const { error: err } = next
      ? await supabase.rpc("react_to_note", { p_owner: entry.userId, p_emoji: next })
      : await supabase.rpc("clear_note_reaction", { p_owner: entry.userId });
    if (err) onReacted(entry.userId, previous);
  }

  async function reply(text: string): Promise<boolean> {
    const body = text.trim();
    if (!body || status === "sending") return false;
    const supabase = createClient();
    setStatus("sending");
    setError(null);

    const { data: convId, error: convErr } = await supabase.rpc("get_or_create_dm", {
      p_other: entry.userId,
    });
    if (convErr || !convId) {
      setStatus("error");
      setError(
        convErr?.message?.includes("dm_restricted")
          ? "They only accept DMs from people they follow"
          : convErr?.message?.includes("blocked")
            ? "You can't reply to this account"
            : "Couldn't send. Check your connection and try again."
      );
      return false;
    }

    const { error: sendErr } = await supabase.rpc("send_message", {
      p_conversation_id: convId,
      p_body: `📔 Replied to your Diary: ${body}`,
      p_kind: "text",
      p_post_id: undefined,
      p_reply_to_id: undefined,
      p_shot_id: undefined,
    });
    if (sendErr) {
      setStatus("error");
      setError("Couldn't send. Check your connection and try again.");
      return false;
    }
    haptics.tap();
    setStatus("sent");
    return true;
  }

  return { react, reply, status, error, resetStatus: () => setStatus("idle") };
}

export const QUICK_EMOJIS = ["❤️", "😂", "🥰", "👍", "😮", "😢"] as const;
