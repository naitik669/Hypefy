"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Globe2, Star, Dices, Music } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
import { TrackPicker } from "@/components/music/TrackPicker";
import { TrackChip } from "@/components/music/TrackChip";
import { type Track } from "@/lib/music";
import {
  splitStatus,
  joinStatus,
  DICE_POOL,
  EMOJI_STRIP,
  type StatusValue,
} from "@/components/ui/StatusComposer";
import { haptics } from "@/lib/haptics";
import { scheduleUndoable } from "@/lib/undoable";
import { useToast } from "@/components/ui/ToastProvider";

// Notes store one 60-char string; the emoji rides at the front of it.
const MAX = 60;
const MAX_TEXT = MAX - 3; // leave room for "<emoji> "

const NOTE_PRESETS: StatusValue[] = [
  { emoji: "🤫", text: "ask me about today" },
  { emoji: "🎧", text: "song on repeat" },
  { emoji: "🍕", text: "who's hungry" },
  { emoji: "🌙", text: "can't sleep, talk?" },
];

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
}: {
  open: boolean;
  onClose: () => void;
  current: MyNote;
  onSaved: (note: MyNote) => void;
  me?: { name: string; hue: number; avatarUrl: string | null };
  /** The same row is a "note" on a profile and a "Diary" in Messages. */
  title?: string;
  subtitle?: string;
}) {
  const toast = useToast();
  const supabase = createClient();
  const [draft, setDraft] = useState<StatusValue>(() => splitStatus(current?.text ?? null));
  const [audience, setAudience] = useState<"mutual" | "close">(current?.audience ?? "mutual");
  const [track, setTrack] = useState<Track | null>(current?.track ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const [rollCount, setRollCount] = useState(0);
  const textRef = useRef<HTMLInputElement>(null);
  const lastRollRef = useRef(-1);

  // Re-seed from the saved note each time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(splitStatus(current?.text ?? null));
      setAudience(current?.audience ?? "mutual");
      setTrack(current?.track ?? null);
      setStripOpen(false);
      setRollCount(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function roll() {
    haptics.tap();
    let i = Math.floor(Math.random() * DICE_POOL.length);
    if (i === lastRollRef.current) i = (i + 1) % DICE_POOL.length;
    lastRollRef.current = i;
    setDraft({ emoji: DICE_POOL[i].emoji, text: DICE_POOL[i].text.slice(0, MAX_TEXT) });
    setRollCount((c) => c + 1); // re-keys the bubble + dice so both animate
    setStripOpen(false);
  }

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
        toast("Couldn't remove your note. Try again.", "error");
        onSaved(was);
      }
    });
    onSaved(null);
    onClose();
    toast("Note removed", "plain", {
      label: "Undo",
      detail: was?.text?.trim() || "Your note",
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
        <div className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-surface/60 px-4 pb-6 pt-8">
          {/* Soft spotlight pulling focus to the bubble + avatar */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 75% 60% at 50% 42%, rgba(163,230,53,0.055), transparent 70%)" }}
          />

          {/* Thought bubble — this IS the input; it idles like it's floating */}
          <div className="animate-bubble-float relative w-full max-w-[280px]">
            <div key={rollCount} className={rollCount ? "animate-roll-in" : undefined}>
              <div className="flex items-center gap-2 rounded-[22px] rounded-bl-md border border-white/[0.09] bg-elevated px-3.5 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.45)]">
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
                  className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-[-0.01em] outline-none placeholder:font-medium placeholder:text-faint"
                />
                {draft.text.length > MAX_TEXT - 10 && (
                  <span className="shrink-0 text-[10px] tabular-nums text-faint">{MAX_TEXT - draft.text.length}</span>
                )}
              </div>
              {/* Bubble tail — steps down toward the avatar */}
              <span className="absolute -bottom-2.5 left-1/2 h-3 w-3 -translate-x-5 rounded-full border border-white/[0.09] bg-elevated" />
              <span className="absolute -bottom-5 left-1/2 h-1.5 w-1.5 -translate-x-2 rounded-full border border-white/[0.09] bg-elevated" />
            </div>

            {/* Dice — perched on the bubble's shoulder, tumbles on each roll */}
            <button
              type="button"
              onClick={roll}
              aria-label="Random note"
              className="absolute -right-2.5 -top-3.5 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted shadow-lg transition-colors hover:text-foreground"
            >
              <span key={rollCount} className={rollCount ? "animate-dice-spin" : undefined}>
                <Dices size={17} />
              </span>
            </button>
          </div>

          {/* Your pfp under the bubble */}
          <div className="relative mt-5">
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

      <TrackPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setTrack} />
    </CenterModal>
  );
}
