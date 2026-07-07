"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Globe2, Star, Dices } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
import {
  splitStatus,
  joinStatus,
  DICE_POOL,
  EMOJI_STRIP,
  type StatusValue,
} from "@/components/ui/StatusComposer";
import { haptics } from "@/lib/haptics";

// Notes store one 60-char string; the emoji rides at the front of it.
const MAX = 60;
const MAX_TEXT = MAX - 3; // leave room for "<emoji> "

const NOTE_PRESETS: StatusValue[] = [
  { emoji: "🤫", text: "ask me about today" },
  { emoji: "🎧", text: "song on repeat" },
  { emoji: "🍕", text: "who's hungry" },
  { emoji: "🌙", text: "can't sleep, talk?" },
];

export type MyNote = { text: string; audience: "mutual" | "close" } | null;

/**
 * Editor for the caller's own Note — a centered modal showing the status UI
 * itself: your avatar with a thought bubble you type straight into, so what
 * you compose is exactly what your circle sees atop their DMs for 24h.
 */
export function NoteEditorSheet({
  open,
  onClose,
  current,
  onSaved,
  me,
}: {
  open: boolean;
  onClose: () => void;
  current: MyNote;
  onSaved: (note: MyNote) => void;
  me?: { name: string; hue: number; avatarUrl: string | null };
}) {
  const supabase = createClient();
  const [draft, setDraft] = useState<StatusValue>(() => splitStatus(current?.text ?? null));
  const [audience, setAudience] = useState<"mutual" | "close">(current?.audience ?? "mutual");
  const [busy, setBusy] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const lastRollRef = useRef(-1);

  // Re-seed from the saved note each time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(splitStatus(current?.text ?? null));
      setAudience(current?.audience ?? "mutual");
      setStripOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function roll() {
    haptics.tap();
    let i = Math.floor(Math.random() * DICE_POOL.length);
    if (i === lastRollRef.current) i = (i + 1) % DICE_POOL.length;
    lastRollRef.current = i;
    setDraft({ emoji: DICE_POOL[i].emoji, text: DICE_POOL[i].text.slice(0, MAX_TEXT) });
    setStripOpen(false);
  }

  async function post() {
    const value = joinStatus(draft).slice(0, MAX);
    if (!value || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_note", { p_text: value, p_audience: audience });
    setBusy(false);
    if (!error) {
      onSaved({ text: value, audience });
      onClose();
    }
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    await supabase.rpc("clear_note");
    setBusy(false);
    onSaved(null);
    onClose();
  }

  return (
    <CenterModal open={open} onClose={onClose} title="Leave a note">
      <div className="flex flex-col gap-4">
        {/* ── Live preview: the note exactly as your circle sees it ── */}
        <div className="relative flex flex-col items-center rounded-3xl bg-surface/60 px-4 pb-5 pt-7">
          {/* Thought bubble — this IS the input */}
          <div className="relative w-full max-w-[280px]">
            <div className="flex items-center gap-2 rounded-[22px] rounded-bl-md border border-white/[0.08] bg-elevated px-3.5 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.4)]">
              <button
                type="button"
                aria-label="Pick emoji"
                onClick={() => setStripOpen((v) => !v)}
                className={`shrink-0 text-[24px] leading-none transition-transform active:scale-90 ${draft.emoji ? "" : "opacity-30 grayscale"}`}
              >
                {draft.emoji || "🙂"}
              </button>
              <input
                ref={textRef}
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value.slice(0, MAX_TEXT) })}
                onFocus={() => setStripOpen(false)}
                placeholder="say something…"
                autoFocus={!current}
                aria-label="Note text"
                className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-faint"
              />
              {draft.text.length > MAX_TEXT - 10 && (
                <span className="shrink-0 text-[10px] tabular-nums text-faint">{MAX_TEXT - draft.text.length}</span>
              )}
            </div>
            {/* Bubble tail — steps down toward the avatar */}
            <span className="absolute -bottom-2.5 left-1/2 h-3 w-3 -translate-x-5 rounded-full border border-white/[0.08] bg-elevated" />
            <span className="absolute -bottom-5 left-1/2 h-1.5 w-1.5 -translate-x-2 rounded-full border border-white/[0.08] bg-elevated" />

            {/* Dice — floats off the bubble's shoulder */}
            <button
              type="button"
              onClick={roll}
              aria-label="Random note"
              className="absolute -right-2.5 -top-3.5 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted shadow-lg transition-all hover:text-foreground active:rotate-12 active:scale-90"
            >
              <Dices size={17} />
            </button>
          </div>

          {/* Your pfp under the bubble */}
          <div className="mt-4">
            <Avatar name={me?.name ?? "You"} hue={me?.hue ?? 280} size={64} src={me?.avatarUrl ?? undefined} />
          </div>
          <span className="mt-1.5 text-[11px] text-faint">visible to your circle · 24h</span>
        </div>

        {/* Emoji strip (opens from the bubble's emoji) */}
        {stripOpen && (
          <div className="no-scrollbar -mt-1 flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-surface p-2">
            {EMOJI_STRIP.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  haptics.select();
                  setDraft((d) => ({ ...d, emoji: d.emoji === e ? "" : e }));
                  setStripOpen(false);
                  textRef.current?.focus();
                }}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition-transform active:scale-90 ${
                  draft.emoji === e ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Suggestions */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {NOTE_PRESETS.map((p) => (
            <button
              key={p.text}
              type="button"
              onClick={() => {
                haptics.select();
                setDraft({ emoji: p.emoji, text: p.text.slice(0, MAX_TEXT) });
                setStripOpen(false);
              }}
              className="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-white/20 hover:text-foreground"
            >
              {p.emoji} {p.text}
            </button>
          ))}
        </div>

        {/* Audience — quiet segmented control */}
        <div className="flex rounded-2xl border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setAudience("mutual")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition-colors ${
              audience === "mutual" ? "bg-elevated text-foreground shadow-sm" : "text-muted"
            }`}
          >
            <Globe2 size={14} /> Mutuals
          </button>
          <button
            type="button"
            onClick={() => setAudience("close")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition-colors ${
              audience === "close" ? "bg-elevated text-foreground shadow-sm" : "text-muted"
            }`}
          >
            <Star size={14} /> Close friends
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={post}
            disabled={(!draft.text.trim() && !draft.emoji) || busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Share note"}
          </button>
          {current && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="py-2 text-center text-[13px] font-semibold text-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              Remove current note
            </button>
          )}
        </div>
      </div>
    </CenterModal>
  );
}
