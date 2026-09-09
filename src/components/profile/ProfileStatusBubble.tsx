"use client";

import { useEffect, useState } from "react";
import { Music } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";
import { parseTrack, type Track } from "@/lib/music";
import { haptics } from "@/lib/haptics";

export type ProfileNote = {
  text: string;
  audience: "mutual" | "close";
  track: unknown;
  createdAt: string;
} | null;

/** Same quick set as chat + the old notes rail, so reactions feel consistent. */
const QUICK_EMOJIS = ["❤️", "🥰", "😂", "👍", "😮", "😢"];

/**
 * The 24h status as a thought bubble floating off the profile avatar's top-left
 * corner. On your own profile it's tappable to edit (and shows a cluster of the
 * reactions you've received); on someone else's it's tappable to react with a
 * quick emoji — a signal without a message. Empty + editable shows a quiet "add
 * a status" nudge; empty + read-only renders nothing.
 */
export function ProfileStatusBubble({
  note: initial,
  editable = false,
  me,
  ownerId,
  viewerId = null,
}: {
  note: ProfileNote;
  editable?: boolean;
  me?: { name: string; hue: number; avatarUrl: string | null };
  ownerId: string;
  viewerId?: string | null;
}) {
  const supabase = createClient();
  const [note, setNote] = useState<ProfileNote>(initial);
  const [open, setOpen] = useState(false); // editor (own profile)
  const [pickerOpen, setPickerOpen] = useState(false); // reaction picker (others)
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [cluster, setCluster] = useState<{ emojis: string[]; count: number }>({ emojis: [], count: 0 });
  const track: Track | null = note ? parseTrack(note.track) : null;

  const canReact = !editable && !!note && !!viewerId;

  // Load reaction state for the current note instance.
  useEffect(() => {
    let active = true;
    if (!note) return;
    (async () => {
      if (editable) {
        const { data } = await supabase
          .from("note_reactions")
          .select("emoji")
          .eq("note_owner_id", ownerId)
          .eq("note_created_at", note.createdAt);
        if (!active) return;
        const rows = (data ?? []) as { emoji: string }[];
        setCluster({ emojis: [...new Set(rows.map((r) => r.emoji))].slice(0, 3), count: rows.length });
      } else if (viewerId) {
        const { data } = await supabase
          .from("note_reactions")
          .select("emoji")
          .eq("note_owner_id", ownerId)
          .eq("reactor_id", viewerId)
          .eq("note_created_at", note.createdAt)
          .maybeSingle();
        if (!active) return;
        setMyReaction((data as any)?.emoji ?? null);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.createdAt, editable, ownerId, viewerId]);

  async function react(emoji: string) {
    if (!note || !viewerId) return;
    const prev = myReaction;
    haptics.select();
    setPickerOpen(false);

    // react_to_note / clear_note_reaction are SECURITY DEFINER RPCs that own the
    // reaction row + its owner notification (clients can't insert notifications).
    if (prev === emoji) {
      setMyReaction(null);
      const { error } = await supabase.rpc("clear_note_reaction", { p_owner: ownerId });
      if (error) setMyReaction(emoji);
      return;
    }

    setMyReaction(emoji);
    const { error } = await supabase.rpc("react_to_note", { p_owner: ownerId, p_emoji: emoji });
    if (error) setMyReaction(prev);
  }

  if (!note && !editable) return null;

  const bubbleBody = note ? (
    <span className="flex items-center gap-1">
      <span className="line-clamp-1 min-w-0">{note.text}</span>
      {track && <Music size={10} className="shrink-0 text-accent" aria-hidden />}
    </span>
  ) : (
    <span className="text-faint">add a status…</span>
  );

  // Sized for the corner of an avatar, not for a chat.
  //
  // max-w-[220px] never did anything: this is absolutely positioned inside
  // the avatar wrapper, so its containing block is 88px wide and the text
  // wrapped to two lines and clipped anyway. What it actually was, measured,
  // is an 88x50 slab with a heavy shadow sitting on top of an 88px avatar —
  // more furniture than the status it carries.
  //
  // Smaller type, tighter padding and one line: a 24h status is a glance, and
  // the full text is one tap away in the editor or the reaction sheet.
  const bubbleClasses =
    "animate-bubble-float pointer-events-auto rounded-[13px] rounded-bl-sm border bg-elevated px-2.5 py-1 text-[11px] font-semibold leading-snug shadow-[0_6px_18px_rgba(0,0,0,0.35)] " +
    (note ? "border-white/[0.09]" : "border-dashed border-border text-muted");

  function onBubbleClick() {
    if (editable) setOpen(true);
    else if (canReact) setPickerOpen((v) => !v);
  }

  return (
    <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5">
      <div className="relative">
        {/* Reaction picker (others' profiles) — floats above the bubble */}
        {pickerOpen && canReact && (
          <div className="pointer-events-auto absolute bottom-full left-0 mb-1.5 flex gap-0.5 rounded-full border border-border bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => react(e)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform active:scale-90 ${
                  myReaction === e ? "bg-accent/20" : "hover:bg-white/10"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {editable || canReact ? (
          <button
            type="button"
            onClick={onBubbleClick}
            aria-label={editable ? (note ? "Edit your status" : "Add a status") : "React to status"}
            className={bubbleClasses + " text-left transition-transform active:scale-[0.98]"}
          >
            {bubbleBody}
          </button>
        ) : (
          <div className={bubbleClasses}>{bubbleBody}</div>
        )}

        {/* Thought-bubble tail — two dots stepping down toward the avatar */}
        <span className="pointer-events-none absolute -bottom-1.5 left-2.5 h-2 w-2 rounded-full border border-white/[0.09] bg-elevated" />
        <span className="pointer-events-none absolute -bottom-3 left-1 h-1 w-1 rounded-full border border-white/[0.09] bg-elevated" />

        {/* My reaction badge (others' profiles) */}
        {!editable && myReaction && (
          <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-[10px] shadow">
            {myReaction}
          </span>
        )}

        {/* Reactions received (own profile) */}
        {editable && cluster.count > 0 && (
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold shadow">
            <span>{cluster.emojis.join("")}</span>
            {cluster.count > 1 && <span className="text-muted">{cluster.count}</span>}
          </span>
        )}
      </div>

      {editable && (
        <NoteEditorSheet
          open={open}
          onClose={() => setOpen(false)}
          current={note as MyNote}
          onSaved={(n) =>
            setNote(
              n
                ? { text: n.text, audience: n.audience, track: n.track, createdAt: new Date().toISOString() }
                : null,
            )
          }
          me={me}
        />
      )}
    </div>
  );
}
