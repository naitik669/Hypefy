"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUp, Loader2, Star } from "lucide-react";
import { flyEmoji, starBurst } from "@/components/diary/flyEmoji";
import { ReactFan } from "@/components/diary/ReactFan";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { QUICK_EMOJIS, useDiaryActions } from "@/components/diary/useDiaryActions";
import { lastReaction, rememberReaction } from "@/lib/emoji";
import type { DiaryEntry } from "@/lib/diary";

type Actions = {
  entry: DiaryEntry;
  mine: string | null;
  onReacted: (userId: string, emoji: string | null) => void;
  hyped?: boolean;
  onHyped?: (userId: string, hyped: boolean) => void;
};

/**
 * The foot of someone's page: a bar to reply in — “Reply to Aman's page” —
 * and one emoji button beside it.
 *
 * The reply is typed right there, on the page; send, and it goes to your DMs
 * with them with the page attached, and the bar clears. The button sends the
 * emoji on its face with a tap (the one you reacted with last, ❤️ at first);
 * hold it and a fan of emoji opens to slide to and let go on, with ⋯ for
 * every emoji. A sent emoji pops up over the page and flies into their
 * avatar. Full-screen, the hype star is at the end of the row; on a card it
 * is in the card's top corner (HypeStar), where the row has no room for it.
 *
 * A tiny "Sent" floats over the row for a moment after either.
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
}: Actions & {
  /** Where a sent emoji lands — the owner's avatar. */
  target: () => Element | null;
  /** Where it pops up first — the page itself. */
  stage?: () => Element | null;
  /** Full-screen holds still while you type or choose an emoji. */
  onTyping?: (busy: boolean) => void;
  size?: "card" | "screen";
}) {
  const { react, reply, status, error, sent, resetStatus } = useDiaryActions({ entry, mine, onReacted, hyped, onHyped });
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [fanOpen, setFanOpen] = useState(false);
  /** The emoji button, while every emoji is open from it. */
  const [moreFrom, setMoreFrom] = useState<HTMLElement | null>(null);
  const face = useSyncExternalStore(lastReaction.subscribe, lastReaction.get, lastReaction.server);
  const first = entry.name.split(" ")[0];
  const big = size === "screen";

  // "Sent" is news for a moment, not a state; clear it after a few seconds.
  useEffect(() => {
    if (status !== "sent") return;
    const id = window.setTimeout(resetStatus, 2000);
    return () => window.clearTimeout(id);
  }, [status, sent, resetStatus]);

  const busy = focused || fanOpen || !!moreFrom;
  useEffect(() => onTyping?.(busy), [busy, onTyping]);

  const note = status === "sent" ? "Sent" : status === "error" ? error : null;

  function send(e: string, from: Element) {
    flyEmoji(e, from, target(), stage?.());
    rememberReaction(e);
    void react(e);
  }

  async function submit() {
    if (!draft.trim() || status === "sending") return;
    if (await reply(draft)) setDraft("");
  }

  return (
    <div className={`relative ${big ? "" : "border-t border-white/[0.07] bg-black/20 px-2.5 py-2"}`}>
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

      <div className="flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className={`flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white/[0.1] ring-1 ring-white/[0.12] transition-colors focus-within:bg-white/[0.14] focus-within:ring-white/25 ${
            big ? "h-12 pl-4 pr-1.5" : "h-10 pl-3.5 pr-1"
          }`}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={`Reply to ${first}'s page…`}
            aria-label={`Reply to ${first}'s page`}
            maxLength={500}
            enterKeyHint="send"
            className={`min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/55 ${big ? "text-[15px]" : "text-[13px]"}`}
          />
          {draft.trim() && (
            <button
              type="submit"
              disabled={status === "sending"}
              aria-label="Send reply"
              className={`flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity disabled:opacity-50 ${
                big ? "h-9 w-9" : "h-8 w-8"
              }`}
            >
              {status === "sending" ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.6} />}
            </button>
          )}
        </form>

        <ReactFan
          face={face}
          quick={QUICK_EMOJIS}
          label={`React to ${first}'s page with ${face}. Hold for more`}
          optionLabel={(e) => `Send ${e} to ${first}`}
          onPick={send}
          onMore={setMoreFrom}
          onOpenChange={setFanOpen}
          size={size}
        />

        {big && (
          <HypeStar
            entry={entry}
            mine={mine}
            onReacted={onReacted}
            hyped={hyped}
            onHyped={onHyped}
            className={`h-12 w-12 ${hyped ? "bg-accent text-accent-ink" : "bg-white/[0.12] text-white hover:bg-white/[0.18]"}`}
          />
        )}
      </div>

      <EmojiPicker
        open={!!moreFrom}
        anchor={moreFrom}
        // One pick is one reaction (and one DM), so it closes as it sends.
        onPick={(e) => {
          const from = moreFrom;
          setMoreFrom(null);
          if (from) send(e, from);
        }}
        onClose={() => setMoreFrom(null)}
      />
    </div>
  );
}

/**
 * The hype star: silent, seen only by the page's owner, lit while you hype
 * it. On a card it sits in the top corner; full-screen, at the end of the
 * reply row.
 */
export function HypeStar({ className = "", ...actions }: Actions & { className?: string }) {
  const { hype } = useDiaryActions(actions);
  const { hyped = false, entry } = actions;
  const first = entry.name.split(" ")[0];
  return (
    <button
      type="button"
      onClick={(ev) => {
        if (!hyped) starBurst(ev.currentTarget);
        void hype();
      }}
      aria-label={hyped ? `Hyped ${first}'s page` : `Hype ${first}'s page`}
      aria-pressed={hyped}
      className={`flex shrink-0 items-center justify-center rounded-full transition-colors ${className}`}
    >
      <Star size={17} strokeWidth={2.3} className={hyped ? "fill-current" : ""} />
    </button>
  );
}
