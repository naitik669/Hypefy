"use client";

import { useState } from "react";
import { Loader2, Globe2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";

const MAX = 60;

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
  const [text, setText] = useState(current?.text ?? "");
  const [audience, setAudience] = useState<"mutual" | "close">(current?.audience ?? "mutual");
  const [busy, setBusy] = useState(false);

  async function post() {
    const value = text.trim();
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
      <div className="pb-4">
        <p className="mb-3 text-xs text-muted">Shared with your circle for 24 hours. Keep it short.</p>

        <div className="relative rounded-2xl border border-border bg-surface px-4 py-3 focus-within:border-accent/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            placeholder="Say something…"
            rows={2}
            autoFocus
            className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <span className="absolute bottom-2 right-3 text-[11px] text-faint">
            {text.length}/{MAX}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
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
          disabled={!text.trim() || busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Share note"}
        </button>

        {current && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="mt-2 w-full rounded-2xl py-2.5 text-sm font-semibold text-danger disabled:opacity-50"
          >
            Clear note
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
