"use client";

import { useEffect, useState } from "react";
import { Reply, Star } from "lucide-react";
import { flyEmoji, starBurst } from "@/components/diary/flyEmoji";
import { DiaryReplyPopup } from "@/components/diary/DiaryReplyPopup";
import { QUICK_EMOJIS, useDiaryActions } from "@/components/diary/useDiaryActions";
import type { DiaryEntry } from "@/lib/diary";

/**
 * The row under someone's page: six emoji in one small pill, a star to hype
 * it, and an arrow to reply — on the card and full-screen alike.
 *
 * An emoji pops up over the page and flies into its owner's avatar, and goes
 * to your DMs with them; nothing stays lit on the button. The star stays lit
 * while you hype the page, because a hype is a thing that is on. The arrow
 * opens a popup to write in. A tiny "Sent" floats over the row for a moment.
 */
export function DiaryResponder({
  entry,
  mine,
  onReacted,
  hyped = false,
  onHyped,
  target,
  stage,
  onTyping,
  size = "card",
}: {
  entry: DiaryEntry;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  hyped?: boolean;
  onHyped?: (userId: string, hyped: boolean) => void;
  /** Where a sent emoji lands — the owner's avatar. */
  target: () => Element | null;
  /** Where it pops up first — the page itself. */
  stage?: () => Element | null;
  /** Full-screen pauses its clock while you are replying. */
  onTyping?: (typing: boolean) => void;
  size?: "card" | "screen";
}) {
  const { react, reply, hype, status, error, sent, resetStatus } = useDiaryActions({
    entry,
    mine,
    onReacted,
    hyped,
    onHyped,
  });
  const [replying, setReplying] = useState(false);
  const first = entry.name.split(" ")[0];
  const big = size === "screen";

  // "Sent" is news for a moment, not a state; clear it after a few seconds.
  useEffect(() => {
    if (status !== "sent") return;
    const id = window.setTimeout(resetStatus, 2000);
    return () => window.clearTimeout(id);
  }, [status, sent, resetStatus]);

  const note = status === "sent" ? "Sent" : status === "error" && !replying ? error : null;

  function openReply(v: boolean) {
    setReplying(v);
    onTyping?.(v);
    if (v && status === "error") resetStatus();
  }

  const round = big ? "h-11 w-11" : "h-9 w-9";

  return (
    <div className="relative">
      {note && (
        <p
          key={`${status}${sent}`}
          aria-live="polite"
          className={`animate-toast-drop pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold shadow-lg ${
            status === "error" ? "bg-danger text-white" : "bg-white text-black"
          }`}
        >
          {note}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <div className={`flex flex-1 items-center justify-between rounded-full bg-black/25 px-1 ${big ? "h-12" : "h-9"}`}>
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={(ev) => {
                flyEmoji(e, ev.currentTarget, target(), stage?.());
                void react(e);
              }}
              aria-label={`Send ${e} to ${first}`}
              className={`flex items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 ${
                big ? "h-10 w-10 text-[23px]" : "h-8 w-8 text-[18px]"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={(ev) => {
            if (!hyped) starBurst(ev.currentTarget);
            void hype();
          }}
          aria-label={hyped ? `Hyped ${first}'s page` : `Hype ${first}'s page`}
          aria-pressed={hyped}
          className={`flex shrink-0 items-center justify-center rounded-full transition-colors ${round} ${
            hyped ? "bg-accent text-accent-ink" : "bg-black/25 text-white hover:bg-black/35"
          }`}
        >
          <Star size={big ? 19 : 16} strokeWidth={2.4} className={hyped ? "fill-current" : ""} />
        </button>
        <button
          type="button"
          onClick={() => openReply(true)}
          aria-label={`Reply to ${first}`}
          aria-haspopup="dialog"
          className={`flex shrink-0 items-center justify-center rounded-full bg-black/25 text-white transition-colors hover:bg-black/35 ${round}`}
        >
          <Reply size={big ? 19 : 16} strokeWidth={2.4} />
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
