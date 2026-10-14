"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Globe2, Star, Music } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
import { TrackPicker } from "@/components/music/TrackPicker";
import { TrackChip } from "@/components/music/TrackChip";
import { type Track } from "@/lib/music";
import {
  splitStatus,
  joinStatus,
  EMOJI_STRIP,
  type StatusValue,
} from "@/components/ui/StatusComposer";
import { THOUGHT_SHELL, ThoughtDots } from "@/components/diary/ThoughtBubble";
import { haptics } from "@/lib/haptics";
import { scheduleUndoable } from "@/lib/undoable";
import { useToast } from "@/components/ui/ToastProvider";

// Notes store one 60-char string; the emoji rides at the front of it.
const MAX = 60;
const MAX_TEXT = MAX - 3; // leave room for "<emoji> "

/**
 * What the empty bubble asks you, one at a time.
 *
 * These replace a row of preset chips and a dice. Both wrote FOR you, which
 * is a strange thing to do to a one-line status — you then had to delete
 * someone else's words to write your own. A prompt that changes while the
 * bubble is empty suggests without filling anything in.
 */
const PROMPTS = [
  "share your thought…",
  "bored today?",
  "are you hyped up?",
  "what's the mood?",
  "on repeat right now?",
  "up to anything?",
  "how's today going?",
  "anyone around?",
  "say something…",
  "what's new?",
];

/** How long each prompt sits before the next. */
const PROMPT_MS = 2600;

export type MyNote = { text: string; audience: "mutual" | "close"; track: Track | null } | null;

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
  title = "Leave a note",
  subtitle = "your circle sees it for 24 hours",
  noun = "note",
}: {
  open: boolean;
  onClose: () => void;
  current: MyNote;
  onSaved: (note: MyNote) => void;
  me?: { name: string; hue: number; avatarUrl: string | null };
  /** The same row is a "note" on a profile and a "Diary" in Messages. */
  title?: string;
  subtitle?: string;
  /**
   * What this row is called where the editor was opened from — it is an
   * UpDate in Messages and a note on a profile. The buttons say it, so a
   * composer titled "Your UpDate" does not then offer to share a note.
   */
  noun?: string;
}) {
  const toast = useToast();
  const supabase = createClient();
  const [draft, setDraft] = useState<StatusValue>(() => splitStatus(current?.text ?? null));
  const [audience, setAudience] = useState<"mutual" | "close">(current?.audience ?? "mutual");
  const [track, setTrack] = useState<Track | null>(current?.track ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const [promptAt, setPromptAt] = useState(0);
  const textRef = useRef<HTMLInputElement>(null);

  // Re-seed from the saved note each time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(splitStatus(current?.text ?? null));
      setAudience(current?.audience ?? "mutual");
      setTrack(current?.track ?? null);
      setStripOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * The prompt changes while there is nothing written. It stops the moment
   * you type: a placeholder moving under your own words is a distraction,
   * and once there are words it is not shown anyway.
   *
   * Someone who has asked for less motion gets one prompt and keeps it.
   */
  const empty = draft.text.trim() === "";
  useEffect(() => {
    if (!open || !empty) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setPromptAt((i) => (i + 1) % PROMPTS.length), PROMPT_MS);
    return () => clearInterval(id);
  }, [open, empty]);

  async function post() {
    const value = joinStatus(draft).slice(0, MAX);
    if (!value || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_note", {
      p_text: value,
      p_audience: audience,
      ...(track ? { p_track: track } : {}),
    });
    setBusy(false);
    if (!error) {
      onSaved({ text: value, audience, track });
      onClose();
    }
  }

  function clear() {
    if (busy) return;
    // Deferred so Undo can stop it: once clear_note runs the note is gone.
    const was = current;
    const cancel = scheduleUndoable(async () => {
      const { error } = await supabase.rpc("clear_note");
      if (error) {
        toast(`Couldn't remove your ${noun}. Try again.`, "error");
        onSaved(was);
      }
    });
    onSaved(null);
    onClose();
    toast(`${noun[0].toUpperCase()}${noun.slice(1)} removed`, "plain", {
      label: "Undo",
      detail: was?.text?.trim() || `Your ${noun}`,
      thumb: { src: me?.avatarUrl ?? null, name: me?.name ?? "Note", hue: me?.hue ?? null },
      onClick: () => {
        cancel();
        onSaved(was);
      },
    });
  }

  return (
    <CenterModal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="flex flex-col gap-4">
        {/* ── The stage: your note exactly as your circle sees it ── */}
        <div className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-background/60 px-4 pb-6 pt-8">
          {/* Soft spotlight pulling focus to the bubble + avatar */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 75% 60% at 50% 42%, rgba(163,230,53,0.055), transparent 70%)" }}
          />

{/* The bubble, which IS the input — the same slab the row draws, so
              what you type here is the thing your circle sees. No border, no
              point: a thought, with its dots falling to your face below. */}
          <div className="relative w-full max-w-[280px]">
            <div className={`flex items-center gap-2 rounded-[20px] px-4 py-3.5 ${THOUGHT_SHELL}`}>
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
                placeholder={PROMPTS[promptAt]}
                autoFocus={!current}
                aria-label="Your UpDate"
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-[-0.01em] outline-none placeholder:font-medium placeholder:text-faint"
              />
              {draft.text.length > MAX_TEXT - 10 && (
                <span className="shrink-0 text-[10px] tabular-nums text-faint">{MAX_TEXT - draft.text.length}</span>
              )}
            </div>
            <ThoughtDots where="stage" />
          </div>

          {/* Your face, where the dots land. */}
          <div className="relative mt-[18px]">
            <Avatar name={me?.name ?? "You"} hue={me?.hue ?? 280} size={64} src={me?.avatarUrl ?? undefined} />
          </div>

          {/* Song on the note — chip when set, quiet pitch when not */}
          <div className="relative mt-4 flex justify-center">
            {track ? (
              <TrackChip track={track} onRemove={() => setTrack(null)} className="max-w-full" />
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1.5 rounded-pill border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-white/20 hover:text-foreground"
              >
                <Music size={13} /> Add a song
              </button>
            )}
          </div>
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
            {busy ? <Loader2 size={16} className="animate-spin" /> : `Share ${noun}`}
          </button>
          {current && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="py-2 text-center text-[13px] font-semibold text-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              Remove current {noun}
            </button>
          )}
        </div>
      </div>

      <TrackPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setTrack} />
    </CenterModal>
  );
}
