"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";
import { parseTrack } from "@/lib/music";

export type NoteRow = {
  user_id: string;
  text: string;
  audience: "mutual" | "close";
  created_at: string;
  is_self: boolean;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  track?: unknown;
};

type Reactor = { id: string; emoji: string; name: string; username: string | null; hue: number; avatarUrl: string | null };

/**
 * Your own status bar atop the inbox — set/edit the note your circle sees for
 * 24h, and see who reacted to it. Everyone else's status is woven onto their
 * conversation row (see MessagesInbox), not a separate story rail.
 */
export function NotesRail({
  rows,
  me,
}: {
  rows: NoteRow[];
  me: { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null };
}) {
  const supabase = createClient();
  const self = rows.find((r) => r.is_self) ?? null;
  const [myNote, setMyNote] = useState<MyNote>(
    self ? { text: self.text, audience: self.audience, track: parseTrack(self.track) } : null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [reactionsOnMine, setReactionsOnMine] = useState<Reactor[]>([]);
  const [reactorsOpen, setReactorsOpen] = useState(false);

  // Who reacted to my current note.
  useEffect(() => {
    if (!self) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("note_reactions")
        .select("reactor_id, emoji")
        .eq("note_owner_id", me.id)
        .eq("note_created_at", self.created_at);
      if (!active || !data?.length) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url")
        .in("id", data.map((r: any) => r.reactor_id));
      if (!active) return;
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
      setReactionsOnMine(
        (data as any[]).map((r) => {
          const p: any = byId.get(r.reactor_id);
          return {
            id: r.reactor_id,
            emoji: r.emoji,
            name: p?.display_name ?? p?.username ?? "User",
            username: p?.username ?? null,
            hue: p?.avatar_hue ?? 280,
            avatarUrl: p?.avatar_url ?? null,
          };
        }),
      );
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clusterEmojis = [...new Set(reactionsOnMine.map((r) => r.emoji))].slice(0, 3);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="relative shrink-0">
            {myNote?.track?.artwork ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={myNote.track.artwork} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <Avatar name={me.name} hue={me.hue} size={40} src={me.avatarUrl ?? undefined} />
            )}
            {!myNote && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-accent text-accent-ink">
                <Plus size={9} strokeWidth={3} />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-faint">Your status</span>
            <span className={`block truncate text-sm ${myNote ? "font-medium text-foreground" : "text-muted"}`}>
              {myNote ? myNote.text : "Tap to set a status"}
            </span>
          </span>
        </button>

        {reactionsOnMine.length > 0 && (
          <button
            type="button"
            aria-label="See who reacted to your status"
            onClick={() => setReactorsOpen(true)}
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-elevated px-2 py-1 text-xs leading-none"
          >
            {clusterEmojis.join("")}
            <span className="ml-0.5 font-bold text-foreground">{reactionsOnMine.length}</span>
          </button>
        )}

        <button
          type="button"
          aria-label={myNote ? "Edit status" : "Set a status"}
          onClick={() => setEditorOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <Pencil size={15} />
        </button>
      </div>

      <NoteEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        current={myNote}
        onSaved={(n) => setMyNote(n)}
        me={{ name: me.name, hue: me.hue, avatarUrl: me.avatarUrl }}
      />

      {/* Who reacted to my status */}
      <BottomSheet open={reactorsOpen} onClose={() => setReactorsOpen(false)} title="Reactions on your status">
        <div className="flex flex-col pb-3">
          {reactionsOnMine.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-2">
              <Avatar name={r.name} hue={r.hue} size={44} src={r.avatarUrl ?? undefined} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                {r.username && <p className="truncate text-xs text-muted">@{r.username}</p>}
              </div>
              <span className="shrink-0 text-xl">{r.emoji}</span>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
