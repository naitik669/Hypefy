"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Dices, Loader2, MoreHorizontal, Palette, Star, X } from "lucide-react";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { ColorPager } from "@/components/ui/ColorPager";
import { quickRow, recentEmoji, rememberEmoji } from "@/lib/emoji";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
import { TrackPicker } from "@/components/music/TrackPicker";
import { PagePhotoPicker } from "@/components/diary/PagePhotoPicker";
import { PagePhoto } from "@/components/diary/PagePhoto";
import { DICE_POOL, EMOJI_STRIP, joinStatus } from "@/components/ui/StatusComposer";
import { haptics } from "@/lib/haptics";
import { scheduleUndoable } from "@/lib/undoable";
import { useToast } from "@/components/ui/ToastProvider";
import { type Track } from "@/lib/music";
import { colorKey, diaryTheme, noteSize, pageColorGroups, type DiaryColor } from "@/components/diary/DiaryPage";
import { DiscSleeve, SongLine } from "@/components/diary/DiaryDisc";
import { AudiencePicker, type Audience } from "@/components/diary/AudiencePicker";

/** notes.text is capped at 60 characters by the database. */
const MAX = 60;

/**
 * Emoji on the line before ⋯. Five: the line has to fit the edit pop-up,
 * which on a phone leaves about 310px — seven and ⋯ at 40px each ran past
 * it and let the whole pop-up scroll sideways.
 */
const QUICK_COUNT = 5;

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
  /** A square photo above the words, once uploaded. */
  imageUrl: string | null;
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
  onRestore,
  me,
  autoFocus = false,
  compact = false,
}: {
  current: DiaryDraft;
  /** Called after a successful save (or take-down, with null). */
  onSaved: (d: DiaryDraft) => void;
  /** Undo after taking the page down: put it back exactly as it was. */
  onRestore?: () => void;
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
  const toast = useToast();
  const [text, setText] = useState(current?.text ?? "");
  const [audience, setAudience] = useState<Audience>(current?.audience ?? "mutual");
  const [photoOpen, setPhotoOpen] = useState(false);
  /** The picture, shown from the file while it uploads so the card fills in
   *  at once; the url is what the page is saved with. */
  const [photo, setPhoto] = useState<{ preview: string; url: string | null } | null>(
    current?.imageUrl ? { preview: current.imageUrl, url: current.imageUrl } : null
  );
  const [uploading, setUploading] = useState(false);

  async function addPhoto(blob: Blob) {
    const preview = URL.createObjectURL(blob);
    setPhoto({ preview, url: null });
    setUploading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setUploading(false);
      return;
    }
    // The folder is the writer's id, which is what the bucket's delete policy
    // is written against (migration 0093).
    const path = `${uid}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("page-media")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    setUploading(false);
    if (error) {
      toast("Couldn't add that photo. Try again.", "error");
      URL.revokeObjectURL(preview);
      setPhoto(null);
      return;
    }
    const { data } = supabase.storage.from("page-media").getPublicUrl(path);
    setPhoto({ preview, url: data.publicUrl });
  }

  function dropPhoto() {
    if (photo?.preview && photo.preview !== photo.url) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
  }
  const [track, setTrack] = useState<Track | null>(current?.track ?? null);
  const [color, setColor] = useState<DiaryColor>(colorKey(current?.color));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [engaged, setEngaged] = useState(!compact);
  const field = useRef<HTMLTextAreaElement>(null);
  const lastRoll = useRef(-1);
  /** The ⋯ button while the emoji popup is open from it. */
  const [emojiFrom, setEmojiFrom] = useState<HTMLElement | null>(null);
  const recent = useSyncExternalStore(recentEmoji.subscribe, recentEmoji.get, recentEmoji.server);
  const quick = quickRow(recent, EMOJI_STRIP, QUICK_COUNT);
  // Emoji tapped on the line are remembered later, not at once: remembering
  // moves them to the front, and a line that reshuffles as you tap puts a
  // different emoji under your finger for the second 🔥 of three.
  const tapped = useRef<string[]>([]);
  const flushTapped = () => {
    for (const e of tapped.current.reverse()) rememberEmoji(e);
    tapped.current = [];
  };
  // Once, on the way out.
  useEffect(() => () => flushTapped(), []);

  // Focus the page when asked, so you can just start writing.
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  const tint = diaryTheme(color, me.hue);
  const { size } = noteSize(text || "What's on your mind?");
  const left = MAX - Array.from(text).length;

  function insert(fragment: string, focus = true) {
    const el = field.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + fragment + text.slice(end)).slice(0, MAX);
    setText(next);
    requestAnimationFrame(() => {
      if (focus) el?.focus();
      const at = Math.min(start + fragment.length, next.length);
      // Moves the caret past what went in even unfocused, so the next one
      // follows it rather than landing where the caret last was.
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
    // A picture on its own is a page; words on their own always were.
    if ((!value && !photo) || busy || uploading) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase.rpc("set_note", {
      p_text: value,
      p_audience: audience,
      ...(track ? { p_track: track } : {}),
      p_color: color,
      ...(photo?.url ? { p_image_url: photo.url } : {}),
    });
    setBusy(false);
    if (error) {
      setFailed(true);
      return;
    }
    haptics.tap();
    onSaved({ text: value, audience, track, color, imageUrl: photo?.url ?? null });
  }

  function remove() {
    if (busy) return;
    // Deferred, not reversed: clear_note deletes the page, and nothing can
    // bring it back afterwards. It leaves the screen now and goes in five
    // seconds unless Undo.
    const words = text.trim();
    const cancel = scheduleUndoable(async () => {
      const { error } = await supabase.rpc("clear_note");
      if (error) {
        toast("Couldn't take your page down. Try again.", "error");
        onRestore?.();
      }
    });
    onSaved(null);
    toast("Page taken down", "plain", {
      label: "Undo",
      detail: words || "Your Spotlight page",
      thumb: { src: me.avatarUrl, name: me.name, hue: me.hue },
      onClick: () => {
        cancel();
        onRestore?.();
      },
    });
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
              <span className="text-sm font-bold text-white">You</span>
              {audience === "close" && <Star size={12} className="fill-accent text-accent" aria-label="Close friends" />}
              {!engaged && (
                // Colours are one of the first things people look for: say
                // they are here even before the page is opened up.
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEngaged(true);
                  }}
                  aria-label="Page colour"
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.12] hover:text-white"
                >
                  <Palette size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEngaged(true);
                  setPhotoOpen(true);
                }}
                aria-label="Add a photo"
                className={`${engaged ? "ml-auto" : ""} flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.12] hover:text-white`}
              >
                <Camera size={15} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEngaged(true);
                  roll();
                }}
                aria-label="Write something random"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.12] hover:text-white`}
              >
                <Dices size={15} />
              </button>
            </div>

            {photo && (
              <div className="relative mt-3">
                <PagePhoto url={photo.preview} />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dropPhoto();
                  }}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
                >
                  <X size={14} />
                </button>
                {uploading && (
                  <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
                    Adding…
                  </span>
                )}
              </div>
            )}

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
              aria-label="Your page"
              className="mt-auto w-full resize-none bg-transparent pt-3 font-extrabold leading-[1.08] tracking-[-0.02em] text-white outline-none placeholder:text-white/25"
              style={{ fontSize: Math.min(Math.round(size * 1.1), 46) }}
            />

            {track && (
              <div className="mt-1">
                <SongLine track={track} onRemove={() => setTrack(null)} />
              </div>
            )}

            {engaged && left <= 20 && (
              <p className={`mt-2 text-right text-[11px] tabular-nums ${left <= 10 ? "font-semibold text-accent" : "text-white/40"}`}>
                {left}
              </p>
            )}
            <span aria-hidden className="absolute bottom-0 left-0 h-[2px] w-full opacity-90" style={{ background: tint.burn }} />
          </div>
        </DiscSleeve>

        {engaged && (
          <>
            {/* ── Emoji: one line, the ones you use first, then ⋯ for the rest ── */}
            {/* The buttons give way if there is even less room, so the line
                never pushes past its box. */}
            <div className="flex items-center justify-between gap-1">
              {quick.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    haptics.select();
                    tapped.current.push(e);
                    insert(e);
                  }}
                  aria-label={`Add ${e}`}
                  className="flex h-10 min-w-0 max-w-10 flex-1 items-center justify-center rounded-full text-[22px] transition-transform hover:bg-white/[0.07] active:scale-[0.8]"
                >
                  {e}
                </button>
              ))}
              <button
                type="button"
                onClick={(ev) => {
                  flushTapped();
                  setEmojiFrom(emojiFrom ? null : ev.currentTarget);
                }}
                aria-label="More emoji"
                aria-haspopup="dialog"
                aria-expanded={!!emojiFrom}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                  emojiFrom ? "bg-white/15 text-white" : "bg-white/[0.07] text-white/75 hover:bg-white/[0.12] hover:text-white"
                }`}
              >
                <MoreHorizontal size={20} strokeWidth={2.6} />
              </button>
            </div>

            {/* ── The page's colour ── */}
            {/* A line of colours per group; swipe for the next group. */}
            <ColorPager
              label="Page colour"
              groups={pageColorGroups(me.hue)}
              value={color}
              onChange={(k) => {
                haptics.select();
                setColor(k as DiaryColor);
              }}
            />

            {/* ── Starters, for when nothing comes to mind ── */}
            {!text && (
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
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
                Couldn&apos;t save. Try again.
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
                {busy ? <Loader2 size={16} className="animate-spin" /> : current ? "Update" : "Post"}
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
      <PagePhotoPicker open={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={(b) => void addPhoto(b)} />
      <EmojiPicker
        open={!!emojiFrom}
        anchor={emojiFrom}
        // Not focusing the page as it goes in: that would raise the keyboard
        // over the popup you are still picking from.
        onPick={(e) => insert(e, false)}
        onClose={() => setEmojiFrom(null)}
      />
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
  onRestore,
  me,
}: {
  open: boolean;
  onClose: () => void;
  current: DiaryDraft;
  onSaved: (d: DiaryDraft) => void;
  onRestore?: () => void;
  me: { name: string; hue: number; avatarUrl: string | null };
}) {
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }
  return (
    <CenterModal open={open} onClose={onClose} title={current ? "Your page" : "New page"}>
      {open && (
        <DiaryComposer
          key={opening}
          current={current}
          me={me}
          autoFocus={!current}
          onRestore={onRestore}
          onSaved={(d) => {
            onSaved(d);
            onClose();
          }}
        />
      )}
    </CenterModal>
  );
}
