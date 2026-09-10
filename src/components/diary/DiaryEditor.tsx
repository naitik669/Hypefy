"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Dices, Loader2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
import { TrackPicker } from "@/components/music/TrackPicker";
import { DICE_POOL, EMOJI_STRIP, joinStatus } from "@/components/ui/StatusComposer";
import { haptics } from "@/lib/haptics";
import { type Track } from "@/lib/music";
import { DIARY_COLORS, colorKey, diaryTheme, noteSize, swatchOf, type DiaryColor } from "@/components/diary/DiaryPage";
import { DiscSleeve, SongLine } from "@/components/diary/DiaryDisc";
import { AudiencePicker, type Audience } from "@/components/diary/AudiencePicker";

/** notes.text is capped at 60 characters by the database. */
const MAX = 60;

const STARTERS = [
  "🎧 on repeat today",
  "☕ chai at 5, who's in",
  "🌙 can't sleep, talk?",
  "📚 locked in till exams end",
  "🫠 long day",
];

export type DiaryDraft = {
  text: string;
  audience: "mutual" | "close";
  track: Track | null;
  color: string | null;
} | null;

/**
 * Writing a Diary — on the page itself.
 *
 * The first version reused the profile-status editor: an avatar with a
 * thought bubble to type into, and a "Share note" button. It worked, but what
 * you wrote looked nothing like what your circle then saw, which was a page.
 * So the editor is the page: your words at the size they will be shown, the
 * song as the CD tucked behind it (tap the blank disc to add one), a full
 * burn line because the day has not started. Who can see it is a dropdown
 * beside Post. What you see here is the card your circle gets.
 */
export function DiaryComposer({
  current,
  onSaved,
  me,
  autoFocus = false,
  compact = false,
}: {
  current: DiaryDraft;
  /** Called after a successful save (or take-down, with null). */
  onSaved: (d: DiaryDraft) => void;
  me: { name: string; hue: number; avatarUrl: string | null };
  autoFocus?: boolean;
  /**
   * Start folded: just the page to write on, the controls appearing once you
   * tap into it. Used inline at the top of the Diary page, where a composer
   * showing every control at rest pushed everyone else's Diaries below the
   * fold — the thing the page exists to show.
   */
  compact?: boolean;
}) {
  const supabase = createClient();
  const [text, setText] = useState(current?.text ?? "");
  const [audience, setAudience] = useState<Audience>(current?.audience ?? "mutual");
  const [track, setTrack] = useState<Track | null>(current?.track ?? null);
  const [color, setColor] = useState<DiaryColor>(colorKey(current?.color));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [engaged, setEngaged] = useState(!compact);
  const field = useRef<HTMLTextAreaElement>(null);
  const lastRoll = useRef(-1);

  // Focus the page when asked, so you can just start writing.
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  const tint = diaryTheme(color, me.hue);
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
      p_color: color,
    });
    setBusy(false);
    if (error) {
      setFailed(true);
      return;
    }
    haptics.tap();
    onSaved({ text: value, audience, track, color });
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
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* ── The page, with its CD behind it ── */}
        <DiscSleeve
          track={track}
          onAdd={() => {
            setEngaged(true);
            setPickerOpen(true);
          }}
        >
          <div
            onClick={() => {
              if (!engaged) {
                setEngaged(true);
                field.current?.focus();
              }
            }}
            className={`relative flex flex-col overflow-hidden rounded-[28px] p-4 ${
              engaged ? "min-h-[220px]" : "min-h-[148px] cursor-text"
            }`}
            style={{ background: tint.background, boxShadow: tint.shadow }}
          >
            <div className="flex items-center gap-2">
              <Avatar name={me.name} hue={me.hue} size={28} src={me.avatarUrl ?? undefined} />
              <span className="text-sm font-bold text-white">{current ? "Your Diary" : "Today"}</span>
              {audience === "close" && <Star size={12} className="fill-accent text-accent" aria-label="Close friends" />}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEngaged(true);
                  roll();
                }}
                aria-label="Write something random"
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.12] hover:text-white"
              >
                <Dices size={15} />
              </button>
            </div>

            {/* The words, at the size the card will show them. */}
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
              rows={engaged ? 3 : 2}
              onFocus={() => setEngaged(true)}
              placeholder="What's on your mind today?"
              aria-label="Your Diary"
              className="mt-auto w-full resize-none bg-transparent pt-3 font-extrabold leading-[1.08] tracking-[-0.02em] text-white outline-none placeholder:text-white/25"
              style={{ fontSize: Math.min(Math.round(size * 1.1), 46) }}
            />

            {track && (
              <div className="mt-1">
                <SongLine track={track} onRemove={() => setTrack(null)} />
              </div>
            )}

            {engaged && (
              <p className="mt-2 flex items-center justify-between text-[11px] text-white/40">
                <span>{track ? "Tap the disc to play it" : "Tap the disc to add a song"}</span>
                <span className={`tabular-nums ${left <= 10 ? "font-semibold text-accent" : ""}`}>{left} left</span>
              </p>
            )}
            <span aria-hidden className="absolute bottom-0 left-0 h-[2px] w-full opacity-90" style={{ background: tint.burn }} />
          </div>
        </DiscSleeve>

        {engaged && (
          <>
            {/* ── Emoji, one tap each ── */}
            <div className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto px-1">
              {EMOJI_STRIP.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    haptics.select();
                    insert(e);
                  }}
                  aria-label={`Add ${e}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition-transform hover:bg-white/[0.07] active:scale-[0.8]"
                >
                  {e}
                </button>
              ))}
            </div>

            {/* ── The page's colour ── */}
            <div role="radiogroup" aria-label="Page colour" className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
              {DIARY_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={color === c.key}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => {
                    haptics.select();
                    setColor(c.key);
                  }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${
                    color === c.key ? "scale-110" : ""
                  }`}
                  style={{ background: swatchOf(c.key, me.hue), boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18)" }}
                >
                  {color === c.key && <Check size={15} strokeWidth={3} className="text-white drop-shadow" />}
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
                    className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {failed && (
              <p className="text-center text-xs font-semibold text-danger">
                Couldn&apos;t save your Diary. Check your connection and try again.
              </p>
            )}

            {/* ── Who can read it, and post ── */}
            <div className="flex items-center gap-2">
              <AudiencePicker value={audience} onChange={setAudience} />
              <button
                type="button"
                onClick={post}
                disabled={!text.trim() || busy}
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : current ? "Update Diary" : "Post to Diary"}
              </button>
            </div>
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
          </>
        )}
      </div>

      <TrackPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setTrack} />
    </>
  );
}

/**
 * The composer in a pop-up — for editing a Diary you have already posted.
 * Writing a first one happens inline on the Diary page instead.
 *
 * Keyed on each opening, so it always starts from what is saved rather than
 * from whatever was half-typed the last time it was dismissed.
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
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }
  return (
    <CenterModal open={open} onClose={onClose} title={current ? "Your Diary" : "Today's page"}>
      {open && (
        <DiaryComposer
          key={opening}
          current={current}
          me={me}
          autoFocus={!current}
          onSaved={(d) => {
            onSaved(d);
            onClose();
          }}
        />
      )}
    </CenterModal>
  );
}
