"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Plane } from "@/components/ui/Plane";
import { flyEmoji } from "@/components/diary/flyEmoji";
import { QUICK_EMOJIS, useDiaryActions } from "@/components/diary/useDiaryActions";
import type { DiaryEntry } from "@/lib/diary";

/**
 * The six emoji and the reply field under someone's Diary — on the card and
 * full-screen alike.
 *
 * Both are there at rest: no button to open the reply first. An emoji flies
 * off to the Diary's owner (their avatar, via `target`) and goes to your DMs
 * with them; nothing stays outlined on the button afterwards. A line below
 * says it went, then clears itself.
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
  /** Full-screen pauses its clock while you type. */
  onTyping?: (typing: boolean) => void;
  size?: "card" | "screen";
}) {
  const { react, reply, status, error, sent, resetStatus } = useDiaryActions({ entry, mine, onReacted });
  const [draft, setDraft] = useState("");
  const first = entry.name.split(" ")[0];
  const big = size === "screen";
  const sentLine =
    status === "sent" ? (sent ? `Sent ${sent} to ${first} · in your DMs` : `Sent to your DMs with ${first}`) : null;

  // "Sent" is news for a moment, not a state; clear it after a few seconds.
  useEffect(() => {
    if (status !== "sent") return;
    const id = window.setTimeout(resetStatus, 2800);
    return () => window.clearTimeout(id);
  }, [status, sent, resetStatus]);

  return (
    <div className={`flex flex-col ${big ? "gap-2.5" : "gap-2"}`}>
      <div className="flex items-center justify-between px-0.5">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={(ev) => {
              flyEmoji(e, ev.currentTarget, target());
              void react(e);
            }}
            aria-label={`Send ${e} to ${first}`}
            className={`flex items-center justify-center rounded-full transition-transform duration-150 hover:bg-white/[0.07] active:scale-[0.8] ${
              big ? "h-12 w-12 text-[26px]" : "h-10 w-10 text-[22px]"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (await reply(draft)) setDraft("");
        }}
        className={`flex items-center gap-2 rounded-full pl-4 pr-1 transition-colors focus-within:bg-white/[0.11] ${
          big ? "h-12 bg-white/[0.1] backdrop-blur-md" : "h-11 bg-white/[0.07]"
        }`}
      >
        <input
          value={draft}
          onChange={(ev) => {
            setDraft(ev.target.value);
            if (status === "error") resetStatus();
          }}
          onFocus={() => onTyping?.(true)}
          onBlur={() => onTyping?.(false)}
          // "Sent" shows where you were about to type, for a moment, rather
          // than on a line of its own that would hold space on every card.
          placeholder={sentLine ?? `Reply to ${first}…`}
          aria-label={`Reply to ${first}`}
          maxLength={500}
          enterKeyHint="send"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || status === "sending"}
          aria-label="Send reply"
          className={`flex shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
            big ? "h-10 w-10" : "h-9 w-9"
          } ${draft.trim() ? "scale-100 bg-accent text-accent-ink" : "scale-90 text-white/35"}`}
        >
          {status === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Plane size={15} />}
        </button>
      </form>

      <p aria-live="polite" className="sr-only">
        {sentLine}
      </p>
      {status === "error" && error && (
        <p className={`px-1 text-xs font-semibold text-danger ${big ? "text-center" : ""}`}>{error}</p>
      )}
    </div>
  );
}
