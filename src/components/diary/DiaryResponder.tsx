"use client";

import { useEffect, useState } from "react";
import { Reply, Star } from "lucide-react";
import { flyEmoji, starBurst } from "@/components/diary/flyEmoji";
import { DiaryReplyPopup } from "@/components/diary/DiaryReplyPopup";
import { QUICK_EMOJIS, useDiaryActions } from "@/components/diary/useDiaryActions";
import type { DiaryEntry } from "@/lib/diary";

/**
 * The row under someone's page: six emoji, a star to hype it, and an arrow
 * to reply. On a card it is a tray along the card's foot; full-screen, a
 * pill and two round buttons sized for thumbs.
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

  const emoji = QUICK_EMOJIS.map((e) => (
    <button
      key={e}
      type="button"
      onClick={(ev) => {
        flyEmoji(e, ev.currentTarget, target(), stage?.());
        void react(e);
      }}
      aria-label={`Send ${e} to ${first}`}
      className={`flex min-w-0 flex-1 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 ${
        big ? "h-10 max-w-10 text-[23px]" : "h-9 max-w-9 text-[19px]"
      }`}
    >
      {e}
    </button>
  ));
  const hypeButton = (className: string) => (
    <button
      type="button"
      onClick={(ev) => {
        if (!hyped) starBurst(ev.currentTarget);
        void hype();
      }}
      aria-label={hyped ? `Hyped ${first}'s page` : `Hype ${first}'s page`}
      aria-pressed={hyped}
      className={className}
    >
      <Star size={big ? 19 : 18} strokeWidth={2.3} className={hyped ? "fill-current" : ""} />
    </button>
  );
  const replyButton = (className: string) => (
    <button
      type="button"
      onClick={() => openReply(true)}
      aria-label={`Reply to ${first}`}
      aria-haspopup="dialog"
      className={className}
    >
      <Reply size={big ? 19 : 18} strokeWidth={2.3} />
    </button>
  );

  return (
    <div className={`relative ${big ? "" : "border-t border-white/[0.07] bg-black/20 px-2 py-1.5"}`}>
      {note && (
        <p
          key={`${status}${sent}`}
          aria-live="polite"
          className={`animate-toast-drop pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold shadow-lg ${
            status === "error" ? "bg-danger text-white" : "bg-white text-black"
          }`}
        >
          {note}
        </p>
      )}

      {big ? (
        // Full-screen: a pill of emoji and two round buttons, sized for thumbs.
        <div className="flex items-center gap-1.5">
          <div className="flex h-12 min-w-0 flex-1 items-center justify-between rounded-full bg-black/25 px-1">{emoji}</div>
          {hypeButton(
            `flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
              hyped ? "bg-accent text-accent-ink" : "bg-black/25 text-white hover:bg-black/35"
            }`
          )}
          {replyButton(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/25 text-white transition-colors hover:bg-black/35"
          )}
        </div>
      ) : (
        // On a card: one tray along its foot — the emoji spread evenly, a
        // hairline, then the star and the arrow as plain icons.
        <div className="flex items-center">
          <div className="flex min-w-0 flex-1 items-center justify-between">{emoji}</div>
          <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-white/15" />
          {hypeButton(
            `flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/[0.08] ${
              hyped ? "text-accent" : "text-white/85"
            }`
          )}
          {replyButton(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/[0.08]"
          )}
        </div>
      )}

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
