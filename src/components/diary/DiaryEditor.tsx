"use client";

import { useEffect, useRef, useState } from "react";
import { Dices, Globe2, Loader2, Music, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
import { TrackPicker } from "@/components/music/TrackPicker";
import { TrackChip } from "@/components/music/TrackChip";
import { DICE_POOL, EMOJI_STRIP, joinStatus } from "@/components/ui/StatusComposer";
import { haptics } from "@/lib/haptics";
import { type Track } from "@/lib/music";
import { noteSize, pageTint } from "@/components/diary/DiaryPage";

/** notes.text is capped at 60 characters by the database. */
const MAX = 60;

const STARTERS = [
  "🎧 on repeat today",
  "☕ chai at 5, who's in",
  "🌙 can't sleep, talk?",
  "📚 locked in till exams end",
  "🫠 long day",
];

export type DiaryDraft = { text: string; audience: "mutual" | "close"; track: Track | null } | null;

/**
 * Writing a Diary — on the page itself.
 *
 * The first version reused the profile-status editor: an avatar with a
 * thought bubble to type into, and a "Share note" button. It worked, but what
 * you wrote looked nothing like what your circle then saw, which was a page.
 * So the editor is the page: your hue, your words at the size they will be
 * shown, your signature at the foot, a full burn line because the day has not
 * started. What you see here is exactly the card in the grid.
 */
export function DiaryEditor({
  open,
  onClose,
  current,
  onSaved,
  me,
}: {
  open: boolean;
  onClose: () => void;
  current: DiaryDraft;
  onSaved: (d: DiaryDraft) => void;
  me: { name: string; hue: number; avatarUrl: string | null };
}) {
  const supabase = createClient();
  const [text, setText] = useState(current?.text ?? "");
  const [audience, setAudience] = useState<"mutual" | "close">(current?.audience ?? "mutual");
  const [track, setTrack] = useState<Track | null>(current?.track ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const lastRoll = useRef(-1);

  // Start from what is saved each time it opens — reset during render,
  // keyed on the open transition, rather than one render late in an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText(current?.text ?? "");
      setAudience(current?.audience ?? "mutual");
      setTrack(current?.track ?? null);
      setFailed(false);
    }
  }

  // Focus the page when it opens empty, so you can just start writing.
  useEffect(() => {
    if (open && !current) field.current?.focus();
  }, [open, current]);

  const tint = pageTint(me.hue);
  const { size } = noteSize(text || "What's on your mind?");
  const left = MAX - Array.from(text).length;

  function insert(fragment: string) {
    const el = field.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + fragment + text.slice(end)).slice(0, MAX);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      const at = Math.min(start + fragment.length, next.length);
      el?.setSelectionRange(at, at);
    });
  }

  function roll() {
    haptics.tap();
    let i = Math.floor(Math.random() * DICE_POOL.length);
    if (i === lastRoll.current) i = (i + 1) % DICE_POOL.length;
    lastRoll.current = i;
    setText(joinStatus(DICE_POOL[i]).slice(0, MAX));
  }

  async function post() {
    const value = text.trim().slice(0, MAX);
    if (!value || busy) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase.rpc("set_note", {
      p_text: value,
      p_audience: audience,
      ...(track ? { p_track: track } : {}),
    });
    setBusy(false);
    if (error) {
      setFailed(true);
      return;
    }
    haptics.tap();
    onSaved({ text: value, audience, track });
    onClose();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("clear_note");
    setBusy(false);
    if (error) {
      setFailed(true);
      return;
    }
    onSaved(null);
    onClose();
  }

  return (
    <CenterModal open={open} onClose={onClose} title={current ? "Your Diary" : "Today's page"}>
      <div className="flex flex-col gap-3">
        {/* ── The page ── */}
        <div
          className="relative flex min-h-[240px] flex-col overflow-hidden rounded-[32px] border p-5"
          style={{ background: tint.background, borderColor: tint.borderColor }}
        >
          <div className="flex items-center gap-2">
            {track ? (
              <TrackChip track={track} onRemove={() => setTrack(null)} className="min-w-0 max-w-[80%]" />
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1.5 rounded-pill bg-black/35 py-1 pl-1.5 pr-2.5 text-[11px] font-semibold text-white/80 backdrop-blur-sm transition-colors hover:text-white"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/15">
                  <Music size={9} />
                </span>
                Add a song
              </button>
            )}
            <button
              type="button"
              onClick={roll}
              aria-label="Write something random"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/35 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
            >
              <Dices size={15} />
            </button>
          </div>

          {/* The words, at the size the grid will show them. */}
          <textarea
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\n/g, " ").slice(0, MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void post();
              }
            }}
            rows={3}
            placeholder="What's on your mind today?"
            aria-label="Your Diary"
            className="mt-auto w-full resize-none bg-transparent font-extrabold leading-[1.08] tracking-[-0.02em] text-white outline-none placeholder:text-white/25"
            style={{ fontSize: Math.min(Math.round(size * 1.1), 46) }}
          />

          <div className="mt-3 flex items-center gap-1.5">
            <Avatar name={me.name} hue={me.hue} size={24} src={me.avatarUrl ?? undefined} />
            <span className="text-sm font-semibold text-white/90">You</span>
            {audience === "close" && <Star size={12} className="fill-accent text-accent" />}
            <span
              className={`ml-auto text-xs tabular-nums ${left <= 10 ? "text-accent" : "text-white/45"}`}
            >
              {left <= 20 ? `${left} left` : "24h"}
            </span>
          </div>
          <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-full opacity-80" style={{ background: tint.burn }} />
        </div>

        {/* ── Emoji, one tap each ── */}
        <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          {EMOJI_STRIP.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                haptics.select();
                insert(e);
              }}
              aria-label={`Add ${e}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition-transform hover:bg-white/5 active:scale-90"
            >
              {e}
            </button>
          ))}
        </div>

        {/* ── Starters, for when nothing comes to mind ── */}
        {!text && (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  haptics.select();
                  setText(s);
                  field.current?.focus();
                }}
                className="shrink-0 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* ── Who can read it ── */}
        <div className="flex rounded-2xl border border-border bg-surface p-1">
          {([
            ["mutual", Globe2, "Mutuals"],
            ["close", Star, "Close friends"],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setAudience(value)}
              aria-pressed={audience === value}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition-colors ${
                audience === value ? "bg-elevated text-foreground shadow-sm" : "text-muted"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {failed && (
          <p className="text-center text-xs font-semibold text-danger">
            Couldn&apos;t save your Diary. Check your connection and try again.
          </p>
        )}

        <button
          type="button"
          onClick={post}
          disabled={!text.trim() || busy}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : current ? "Update Diary" : "Post to Diary"}
        </button>
        {current && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="-mt-1 py-1.5 text-center text-[13px] font-semibold text-muted transition-colors hover:text-danger disabled:opacity-50"
          >
            Take it down
          </button>
        )}
      </div>

      <TrackPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setTrack} />
    </CenterModal>
  );
}
