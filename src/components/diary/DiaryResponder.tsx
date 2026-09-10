"use client";

import { useEffect, useState } from "react";
import { Reply } from "lucide-react";
import { flyEmoji } from "@/components/diary/flyEmoji";
import { DiaryReplyPopup } from "@/components/diary/DiaryReplyPopup";
import { QUICK_EMOJIS, useDiaryActions } from "@/components/diary/useDiaryActions";
import type { DiaryEntry } from "@/lib/diary";

/**
 * The row under someone's Diary: six emoji and a reply arrow — on the card
 * and full-screen alike.
 *
 * An emoji flies off to the Diary's owner (their avatar, via `target`) and
 * goes to your DMs with them; nothing stays outlined on the button. The
 * arrow opens a popup to write a reply in, rather than a text field sitting
 * on every card. Either way a small "Sent" shows over the row for a moment.
 */
export function DiaryResponder({
  entry,
  mine,
  onReacted,
  target,
  onTyping,
  size = "card",
}: {
  entry: DiaryEntry;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  /** Where a sent emoji flies to — the owner's avatar. */
  target: () => Element | null;
  /** Full-screen pauses its clock while you are replying. */
  onTyping?: (typing: boolean) => void;
  size?: "card" | "screen";
}) {
  const { react, reply, status, error, sent, resetStatus } = useDiaryActions({ entry, mine, onReacted });
  const [replying, setReplying] = useState(false);
  const first = entry.name.split(" ")[0];
  const big = size === "screen";

  // "Sent" is news for a moment, not a state; clear it after a few seconds.
  useEffect(() => {
    if (status !== "sent") return;
    const id = window.setTimeout(resetStatus, 2400);
    return () => window.clearTimeout(id);
  }, [status, sent, resetStatus]);

  const note =
    status === "sent"
      ? sent
        ? `Sent ${sent} to ${first}`
        : `Sent to your DMs with ${first}`
      : status === "error" && !replying
        ? error
        : null;

  function openReply(v: boolean) {
    setReplying(v);
    onTyping?.(v);
    if (v && status === "error") resetStatus();
  }

  return (
    <div className="relative">
      {note && (
        <p
          key={`${status}${sent}`}
          aria-live="polite"
          className={`animate-toast-drop pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg ${
            status === "error" ? "bg-danger text-white" : "bg-white text-black"
          }`}
        >
          {note}
        </p>
      )}

      <div className="flex items-center justify-between">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={(ev) => {
              flyEmoji(e, ev.currentTarget, target());
              void react(e);
            }}
            aria-label={`Send ${e} to ${first}`}
            className={`flex items-center justify-center rounded-full transition-transform duration-150 hover:bg-white/[0.08] active:scale-[0.8] ${
              big ? "h-11 w-11 text-[25px]" : "h-9 w-9 text-[20px]"
            }`}
          >
            {e}
          </button>
        ))}
        <button
          type="button"
          onClick={() => openReply(true)}
          aria-label={`Reply to ${first}`}
          aria-haspopup="dialog"
          className={`flex items-center justify-center rounded-full bg-white/[0.12] text-white transition-colors hover:bg-white/20 active:scale-95 ${
            big ? "h-11 w-11" : "h-9 w-9"
          }`}
        >
          <Reply size={big ? 20 : 17} strokeWidth={2.4} />
        </button>
      </div>

      <DiaryReplyPopup
        entry={entry}
        open={replying}
        onClose={() => openReply(false)}
        reply={reply}
        status={status}
        error={error}
      />
    </div>
  );
}
