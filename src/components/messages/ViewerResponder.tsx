"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { ReactFan } from "@/components/diary/ReactFan";
import { flyEmoji } from "@/components/diary/flyEmoji";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { QUICK_EMOJIS } from "@/components/diary/useDiaryActions";
import { lastReaction, rememberReaction } from "@/lib/emoji";

/**
 * Reply and react to a photo, from the full-screen viewer.
 *
 * The Spotlight page's own foot, not a lookalike: a round bar to type a reply
 * in, and one emoji button beside it — tap sends the emoji on its face, hold
 * opens the fan, ⋯ opens every emoji. A reply is sent as a reply to the photo,
 * so it lands in the chat quoting it; a reaction lands on the photo itself.
 */
export function ViewerResponder({
  label,
  onReply,
  onReact,
  target,
}: {
  /** What the bar says, e.g. "Reply to Aman…". */
  label: string;
  /** Send a reply. True when it went. */
  onReply: (text: string) => Promise<boolean>;
  onReact: (emoji: string) => void;
  /** Where a sent emoji flies to: the sender's face in the viewer's header. */
  target: () => Element | null;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [moreFrom, setMoreFrom] = useState<HTMLElement | null>(null);
  const face = useSyncExternalStore(lastReaction.subscribe, lastReaction.get, lastReaction.server);

  function flash(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(null), 1800);
  }

  function react(e: string, from: Element) {
    flyEmoji(e, from, target());
    rememberReaction(e);
    onReact(e);
  }

  async function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onReply(text);
    setSending(false);
    if (ok) {
      setDraft("");
      flash("Sent");
    } else {
      flash("Couldn't send");
    }
  }

  return (
    // The viewer's own gestures (swipe, pinch, tap to hide) stop here.
    <div data-viewer-control className="relative w-full">
      {note && (
        <p
          aria-live="polite"
          className="animate-toast-drop pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-black shadow-lg"
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
          className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-full bg-white/[0.12] pl-4 pr-1.5 ring-1 ring-white/[0.14] backdrop-blur-md transition-colors focus-within:bg-white/[0.16] focus-within:ring-white/25"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={label}
            aria-label={label.replace(/…$/, "")}
            maxLength={2000}
            enterKeyHint="send"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/60"
          />
          {draft.trim() && (
            <button
              type="submit"
              disabled={sending}
              aria-label="Send reply"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity disabled:opacity-50"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.6} />}
            </button>
          )}
        </form>

        <ReactFan
          face={face}
          quick={QUICK_EMOJIS}
          label={`React with ${face}. Hold for more`}
          optionLabel={(e) => `React with ${e}`}
          onPick={react}
          onMore={setMoreFrom}
          size="screen"
        />
      </div>

      <EmojiPicker
        open={!!moreFrom}
        anchor={moreFrom}
        onPick={(e) => {
          const from = moreFrom;
          setMoreFrom(null);
          if (from) react(e, from);
        }}
        onClose={() => setMoreFrom(null)}
      />
    </div>
  );
}
