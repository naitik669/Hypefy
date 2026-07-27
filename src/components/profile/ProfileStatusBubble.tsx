"use client";

import { useState } from "react";
import { Music } from "lucide-react";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";
import { parseTrack, type Track } from "@/lib/music";

export type ProfileNote = {
  text: string;
  audience: "mutual" | "close";
  track: unknown;
} | null;

/**
 * The 24h status as a thought bubble floating off the profile avatar's top-left
 * corner — the successor to the old DM status rail. On your own profile it's
 * tappable and opens the note editor; on someone else's it's read-only. Empty +
 * editable shows a quiet "add a status" nudge; empty + read-only renders nothing.
 */
export function ProfileStatusBubble({
  note: initial,
  editable = false,
  me,
}: {
  note: ProfileNote;
  editable?: boolean;
  me?: { name: string; hue: number; avatarUrl: string | null };
}) {
  const [note, setNote] = useState<ProfileNote>(initial);
  const [open, setOpen] = useState(false);
  const track: Track | null = note ? parseTrack(note.track) : null;

  if (!note && !editable) return null;

  const bubble = note ? (
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

  return (
    <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-2">
      <div className="relative">
        {editable ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={note ? "Edit your status" : "Add a status"}
            className={bubbleClasses + " text-left transition-transform active:scale-[0.98]"}
          >
            {bubble}
          </button>
        ) : (
          <div className={bubbleClasses}>{bubble}</div>
        )}
        {/* Thought-bubble tail — two dots stepping down toward the avatar */}
        <span className="pointer-events-none absolute -bottom-2 left-3 h-2.5 w-2.5 rounded-full border border-white/[0.09] bg-elevated" />
        <span className="pointer-events-none absolute -bottom-4 left-1.5 h-1.5 w-1.5 rounded-full border border-white/[0.09] bg-elevated" />
      </div>

      {editable && (
        <NoteEditorSheet
          open={open}
          onClose={() => setOpen(false)}
          current={note as MyNote}
          onSaved={(n) => setNote(n ? { text: n.text, audience: n.audience, track: n.track } : null)}
          me={me}
        />
      )}
    </div>
  );
}
