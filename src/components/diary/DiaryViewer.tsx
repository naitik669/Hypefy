"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
import { TrackChip } from "@/components/music/TrackChip";
import { Plane } from "@/components/ui/Plane";
import { haptics } from "@/lib/haptics";
import { timeLeft, type DiaryEntry } from "@/lib/diary";

const QUICK_EMOJIS = ["❤️", "🥰", "😂", "👍", "😮", "😢"];

/**
 * Someone else's Diary, opened.
 *
 * Two ways to answer it, and they do different things on purpose. A reaction
 * is a tap — it lands on the Diary and tells its owner once (react_to_note
 * only notifies on the first reaction, so changing your mind is silent). A
 * reply is a message: it goes to your DMs with them, prefixed so the thread
 * reads as an answer to something rather than a line out of nowhere. That is
 * the same shape as replying to a Show, and it uses the same two RPCs.
 */
export function DiaryViewer({
  entry,
  currentUserId,
  onClose,
}: {
  entry: DiaryEntry | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [mine, setMine] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // A different Diary opened: start clean — no half-typed reply to someone
  // else, no "Sent" left over, no reaction borrowed from the last one. Done
  // during render, keyed on the Diary, rather than in an effect that would
  // paint the old state first.
  const key = entry ? `${entry.userId}:${entry.createdAt}` : null;
  const [openedKey, setOpenedKey] = useState(key);
  if (key !== openedKey) {
    setOpenedKey(key);
    if (key) {
      setReply("");
      setStatus("idle");
      setError(null);
      setMine(null);
    }
  }

  // Load my reaction to THIS diary — matched on created_at, because a
  // reaction to yesterday's diary from the same person is not a reaction to
  // today's.
  useEffect(() => {
    if (!entry) return;
    let live = true;
    supabase
      .from("note_reactions")
      .select("emoji")
      .eq("note_owner_id", entry.userId)
      .eq("reactor_id", currentUserId)
      .eq("note_created_at", entry.createdAt)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setMine((data as { emoji?: string } | null)?.emoji ?? null);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.userId, entry?.createdAt]);

  async function react(emoji: string) {
    if (!entry) return;
    haptics.tap();
    const previous = mine;
    const next = previous === emoji ? null : emoji;
    setMine(next); // optimistic; restored below if the server says no
    const { error: err } = next
      ? await supabase.rpc("react_to_note", { p_owner: entry.userId, p_emoji: next })
      : await supabase.rpc("clear_note_reaction", { p_owner: entry.userId });
    if (err) setMine(previous);
  }

  async function sendReply() {
    const text = reply.trim();
    if (!entry || !text || status === "sending") return;
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
            ? "Can't reply to this account"
            : "Couldn't send reply"
      );
      return;
    }

    const { error: sendErr } = await supabase.rpc("send_message", {
      p_conversation_id: convId,
      p_body: `📔 Replied to your Diary: ${text}`,
      p_kind: "text",
      p_post_id: undefined,
      p_reply_to_id: undefined,
      p_shot_id: undefined,
    });
    if (sendErr) {
      setStatus("error");
      setError("Couldn't send reply");
      return;
    }
    haptics.tap();
    setReply("");
    setStatus("sent");
  }

  return (
    <CenterModal open={!!entry} onClose={onClose}>
      {entry && (
        <div className="flex flex-col items-center gap-4 pb-1">
          <Link
            href={entry.username ? `/u/${entry.username}` : "#"}
            onClick={onClose}
            className="flex flex-col items-center gap-2"
          >
            <Avatar
              name={entry.name}
              hue={entry.hue}
              size={72}
              src={entry.avatarUrl ?? undefined}
            />
            <div className="text-center">
              <p className="text-base font-bold leading-tight">{entry.name}</p>
              <p className="text-xs text-faint">
                {entry.username ? `@${entry.username} · ` : ""}
                {timeLeft(entry.createdAt)}
              </p>
            </div>
          </Link>

          {entry.audience === "close" && (
            <span className="-mt-1 flex items-center gap-1 rounded-pill bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent">
              <Star size={11} fill="currentColor" /> Close friends
            </span>
          )}

          {/* The Diary itself. A chat bubble, squared at the top-left where it
              leaves the person who wrote it — the same shape the profile
              status used, so the two read as one thing. */}
          <p className="w-full whitespace-pre-wrap break-words rounded-[20px] rounded-tl-md border border-border bg-elevated px-4 py-3 text-center text-lg font-semibold leading-snug">
            {entry.text}
          </p>

          {entry.track && <TrackChip track={entry.track} className="w-full" />}

          <div className="flex w-full items-center justify-between px-1">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => react(e)}
                aria-label={`React ${e}`}
                aria-pressed={mine === e}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform active:scale-90 ${
                  mine === e ? "scale-110 bg-accent/20 ring-2 ring-accent" : "bg-surface"
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendReply();
            }}
            className="flex w-full items-center gap-2 rounded-pill border border-border bg-surface py-1 pl-4 pr-1"
          >
            <input
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                if (status !== "sending") setStatus("idle");
              }}
              placeholder={`Reply to ${entry.name.split(" ")[0]}…`}
              maxLength={500}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-faint"
            />
            <button
              type="submit"
              disabled={!reply.trim() || status === "sending"}
              aria-label="Send reply"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
            >
              {status === "sending" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plane size={16} />
              )}
            </button>
          </form>

          {status === "sent" && (
            <p className="-mt-2 text-xs font-semibold text-accent">Sent to your DMs</p>
          )}
          {status === "error" && error && (
            <p className="-mt-2 text-xs font-semibold text-danger">{error}</p>
          )}
        </div>
      )}
    </CenterModal>
  );
}
