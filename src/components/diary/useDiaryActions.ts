"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import type { DiaryEntry } from "@/lib/diary";

export type ReplyStatus = "idle" | "sending" | "sent" | "error";

function sendError(message: string | undefined): string {
  if (message?.includes("No active note")) return "This page has ended.";
  if (message?.includes("dm_restricted")) return "They only take DMs from people they follow.";
  if (message?.includes("blocked") || message?.includes("Blocked")) return "You can't reply to this account.";
  return "Couldn't send. Try again.";
}

/**
 * What you can do with someone's page — the same on the card in the deck and
 * full-screen, so both behave identically.
 *
 * An emoji and a reply both arrive in your DMs with them as an embed of the
 * page (send_page_reply copies the page into the message, so the chat still
 * shows what was answered after the page is gone). An emoji is also kept on
 * the page (react_to_note), which is what lets its owner see who sent what.
 * A hype is a star on the page: silent, seen only by its owner.
 *
 * Tapping the emoji you last sent to this page again replays the animation
 * but sends nothing, so a double tap is not two messages.
 */
export function useDiaryActions({
  entry,
  mine,
  onReacted,
  hyped = false,
  onHyped,
}: {
  entry: DiaryEntry;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  hyped?: boolean;
  onHyped?: (userId: string, hyped: boolean) => void;
}) {
  const [status, setStatus] = useState<ReplyStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  /** What was last sent, for the "Sent" note. */
  const [sent, setSent] = useState<string | null>(null);
  const resetStatus = useCallback(() => setStatus("idle"), []);

  async function toDm(text: string): Promise<boolean> {
    const { error: err } = await createClient().rpc("send_page_reply", { p_owner: entry.userId, p_body: text });
    if (err) setError(sendError(err.message));
    return !err;
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
      setError(sendError(err.message));
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

  async function hype() {
    haptics.tap();
    const next = !hyped;
    onHyped?.(entry.userId, next); // optimistic
    const { data, error: err } = await createClient().rpc("toggle_note_hype", { p_owner: entry.userId });
    if (err) {
      onHyped?.(entry.userId, hyped);
      setStatus("error");
      setError(sendError(err.message));
      return;
    }
    // The server says where it landed; a double tap elsewhere may have raced.
    if (typeof data === "boolean" && data !== next) onHyped?.(entry.userId, data);
  }

  return { react, reply, hype, status, error, sent, resetStatus };
}

/** The reactions a tap away; the ⋯ beside them reaches the rest. Five, so
 *  the row still has room for ⋯, the star and the arrow on a card. */
export const QUICK_EMOJIS = ["❤️", "😂", "🥰", "😮", "😢"] as const;
