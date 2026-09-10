"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import type { DiaryEntry } from "@/lib/diary";

export type ReplyStatus = "idle" | "sending" | "sent" | "error";

/** What lands in their DMs — the same prefix for a word or an emoji. */
export const diaryReplyBody = (text: string) => `📔 Replied to your Diary: ${text}`;

/**
 * Reacting to and replying to someone's Diary — the same actions on the card
 * in the list and on the full-screen page, so both behave identically.
 *
 * Both end up in your DMs with them, as "📔 Replied to your Diary: …" — an
 * emoji is a reply, just a short one. A reaction is also kept on the Diary
 * itself (react_to_note), which is what lets its owner see everyone who
 * reacted on the Diary page.
 *
 * Tapping the emoji you last sent to this Diary again replays the animation
 * but sends nothing, so a double tap is not two messages.
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
  /** What was last sent, for the "Sent … to Aman" line. */
  const [sent, setSent] = useState<string | null>(null);
  const resetStatus = useCallback(() => setStatus("idle"), []);

  async function toDm(text: string): Promise<boolean> {
    const supabase = createClient();
    const { data: convId, error: convErr } = await supabase.rpc("get_or_create_dm", {
      p_other: entry.userId,
    });
    if (convErr || !convId) {
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
      p_body: diaryReplyBody(text),
      p_kind: "text",
      p_post_id: undefined,
      p_reply_to_id: undefined,
      p_shot_id: undefined,
    });
    if (sendErr) {
      setError("Couldn't send. Check your connection and try again.");
      return false;
    }
    return true;
  }

  async function react(emoji: string) {
    haptics.tap();
    if (mine === emoji) return;
    const previous = mine;
    onReacted(entry.userId, emoji); // optimistic; put back if the server says no
    setError(null);
    setSent(emoji);
    setStatus("sent");

    const { error: err } = await createClient().rpc("react_to_note", {
      p_owner: entry.userId,
      p_emoji: emoji,
    });
    if (err) {
      onReacted(entry.userId, previous);
      setStatus("error");
      setError(err.message?.includes("No active note") ? "This Diary has ended." : "Couldn't send. Check your connection and try again.");
      return;
    }
    if (!(await toDm(emoji))) setStatus("error");
  }

  async function reply(text: string): Promise<boolean> {
    const body = text.trim();
    if (!body || status === "sending") return false;
    setStatus("sending");
    setError(null);
    if (!(await toDm(body))) {
      setStatus("error");
      return false;
    }
    haptics.tap();
    setSent(null);
    setStatus("sent");
    return true;
  }

  return { react, reply, status, error, sent, resetStatus };
}

export const QUICK_EMOJIS = ["❤️", "😂", "🥰", "👍", "😮", "😢"] as const;
