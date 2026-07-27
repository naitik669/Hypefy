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

    if (prev === emoji) {
      setMyReaction(null);
      const { error } = await supabase
        .from("note_reactions")
        .delete()
        .eq("note_owner_id", ownerId)
        .eq("reactor_id", viewerId);
      if (error) setMyReaction(emoji);
      return;
    }

    setMyReaction(emoji);
    const { error } = await supabase.from("note_reactions").upsert(
      { note_owner_id: ownerId, reactor_id: viewerId, emoji, note_created_at: note.createdAt },
      { onConflict: "note_owner_id,reactor_id" },
    );
    if (error) {
      setMyReaction(prev);
      return;
    }
    // Quiet ping for the owner — only on a fresh reaction, not emoji swaps.
    if (!prev) {
      await supabase.from("notifications").insert({
        user_id: ownerId,
        actor_id: viewerId,
        type: "note_reaction",
        target_type: "profile",
        target_id: ownerId,
        body: `reacted ${emoji} to your status`,
      });
    }
  }

  if (!note && !editable) return null;

  const bubbleBody = note ? (
    <span className="flex items-center gap-1.5">
      <span className="line-clamp-2 min-w-0">{note.text}</span>
      {track && <Music size={12} className="shrink-0 text-accent" aria-hidden />}
    </span>
  ) : (
    <span className="text-faint">add a status…</span>
  );

  const bubbleClasses =
    "animate-bubble-float pointer-events-auto max-w-[220px] rounded-[18px] rounded-bl-md border bg-elevated px-3 py-1.5 text-[13px] font-semibold leading-snug shadow-[0_10px_28px_rgba(0,0,0,0.4)] " +
    (note ? "border-white/[0.09]" : "border-dashed border-border text-muted");

  function onBubbleClick() {
    if (editable) setOpen(true);
    else if (canReact) setPickerOpen((v) => !v);
  }

  return (
    <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-2">
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
        <span className="pointer-events-none absolute -bottom-2 left-3 h-2.5 w-2.5 rounded-full border border-white/[0.09] bg-elevated" />
        <span className="pointer-events-none absolute -bottom-4 left-1.5 h-1.5 w-1.5 rounded-full border border-white/[0.09] bg-elevated" />

        {/* My reaction badge (others' profiles) */}
        {!editable && myReaction && (
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-xs shadow">
            {myReaction}
          </span>
        )}

        {/* Reactions received (own profile) */}
        {editable && cluster.count > 0 && (
          <span className="pointer-events-none absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold shadow">
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
