"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";

export type NoteRow = {
  user_id: string;
  text: string;
  audience: "mutual" | "close";
  is_self: boolean;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

/**
 * Instagram-style Notes rail atop the inbox: your avatar with a speech bubble
 * to leave/edit a note, then your circle's notes. Tapping someone's note opens
 * a DM with their note prefilled as a quoted reply — the private-confession loop.
 */
export function NotesRail({
  rows,
  me,
}: {
  rows: NoteRow[];
  me: { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null };
}) {
  const supabase = createClient();
  const router = useRouter();
  const self = rows.find((r) => r.is_self) ?? null;
  const [myNote, setMyNote] = useState<MyNote>(self ? { text: self.text, audience: self.audience } : null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const others = rows.filter((r) => !r.is_self);

  async function reply(note: NoteRow) {
    if (opening) return;
    setOpening(note.user_id);
    const { data: convId, error } = await supabase.rpc("get_or_create_dm", { p_other: note.user_id });
    if (error || !convId) {
      setOpening(null);
      return;
    }
    const prefill = encodeURIComponent(`Replying to your note "${note.text}" — `);
    router.push(`/messages/${convId}?prefill=${prefill}`);
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto border-b border-border/60 px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Your note */}
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="flex w-16 shrink-0 flex-col items-center gap-1.5"
        >
          <div className="relative">
            <div className="max-w-[72px] truncate rounded-2xl rounded-bl-sm bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground">
              {myNote ? myNote.text : "Status…"}
            </div>
            <div className="mt-1 flex justify-center">
              <div className="relative">
                <Avatar name={me.name} hue={me.hue} size={52} src={me.avatarUrl ?? undefined} />
                {!myNote && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-accent text-accent-ink">
                    <Plus size={12} strokeWidth={3} />
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="max-w-[64px] truncate text-[11px] text-muted">Your status</span>
        </button>

        {/* Circle's notes */}
        {others.map((note) => {
          const label = note.display_name ?? note.username ?? "User";
          return (
            <button
              key={note.user_id}
              type="button"
              onClick={() => reply(note)}
              disabled={!!opening}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 disabled:opacity-60"
            >
              <div className="max-w-[72px] truncate rounded-2xl rounded-bl-sm bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground">
                {note.text}
              </div>
              <Avatar name={label} hue={note.avatar_hue ?? 280} size={52} src={note.avatar_url ?? undefined} />
              <span className="max-w-[64px] truncate text-[11px] text-muted">{note.username ? `@${note.username}` : label}</span>
            </button>
          );
        })}
      </div>

      <NoteEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        current={myNote}
        onSaved={(n) => setMyNote(n)}
      />
    </>
  );
}
