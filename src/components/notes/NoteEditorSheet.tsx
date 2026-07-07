"use client";

import { useEffect, useState } from "react";
import { Loader2, Globe2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StatusComposer, splitStatus, joinStatus, type StatusValue } from "@/components/ui/StatusComposer";

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
 * Editor for the caller's own Note — a vague 24h micro-status your circle sees
 * atop their DMs. Audience = mutual followers (default) or close friends.
 */
export function NoteEditorSheet({
  open,
  onClose,
  current,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  current: MyNote;
  onSaved: (note: MyNote) => void;
}) {
  const supabase = createClient();
  const [draft, setDraft] = useState<StatusValue>(() => splitStatus(current?.text ?? null));
  const [audience, setAudience] = useState<"mutual" | "close">(current?.audience ?? "mutual");
  const [busy, setBusy] = useState(false);

  // Re-seed from the saved note each time the sheet opens.
  useEffect(() => {
    if (open) {
      setDraft(splitStatus(current?.text ?? null));
      setAudience(current?.audience ?? "mutual");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    <BottomSheet open={open} onClose={onClose} title="Leave a note">
      <div className="flex flex-col gap-4 pb-4">
        <p className="text-xs text-muted">Shared with your circle for 24 hours. Keep it short.</p>

        <StatusComposer
          value={draft}
          onChange={setDraft}
          placeholder="say something…"
          maxTextLen={MAX_TEXT}
          presets={NOTE_PRESETS}
          autoFocus={!current}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAudience("mutual")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
              audience === "mutual" ? "border-accent/40 bg-accent/[0.08] text-foreground" : "border-border text-muted"
            }`}
          >
            <Globe2 size={15} /> Mutuals
          </button>
          <button
            type="button"
            onClick={() => setAudience("close")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
              audience === "close" ? "border-accent/40 bg-accent/[0.08] text-foreground" : "border-border text-muted"
            }`}
          >
            <Star size={15} /> Close friends
          </button>
        </div>

        <button
          type="button"
          onClick={post}
          disabled={(!draft.text.trim() && !draft.emoji) || busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Share note"}
        </button>

        {current && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="rounded-2xl py-1 text-sm font-semibold text-danger disabled:opacity-50"
          >
            Clear note
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
