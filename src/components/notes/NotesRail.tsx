"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";
import { haptics } from "@/lib/haptics";
import { parseTrack, playPreview, usePlayingTrackId } from "@/lib/music";

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

/** Same quick set as chat message reactions. */
const QUICK_EMOJIS = ["❤️", "🥰", "😂", "👍", "😮", "😢"];
const LONG_PRESS_MS = 450;

type Reactor = { id: string; emoji: string; name: string; username: string | null; hue: number; avatarUrl: string | null };

/**
 * Instagram-style Notes rail atop the inbox: your avatar with a speech bubble
 * to leave/edit a note, then your circle's notes. Tapping someone's note opens
 * a DM with their note prefilled as a quoted reply — the private-confession loop.
 * Long-pressing a note opens quick emoji reactions: a signal without a message.
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
  const [myNote, setMyNote] = useState<MyNote>(
    self ? { text: self.text, audience: self.audience, track: parseTrack(self.track) } : null,
  );
  const playingTrackId = usePlayingTrackId();
  const [editorOpen, setEditorOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  // My reaction per note owner (only ones matching the CURRENT note instance).
  const [myReactions, setMyReactions] = useState<Map<string, string>>(new Map());
  // Reactions on my own note + who left them.
  const [reactionsOnMine, setReactionsOnMine] = useState<Reactor[]>([]);
  const [reactTarget, setReactTarget] = useState<NoteRow | null>(null);
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const others = rows.filter((r) => !r.is_self);

  useEffect(() => {
    let active = true;
    (async () => {
      const [mineRes, onMineRes] = await Promise.all([
        others.length
          ? supabase
              .from("note_reactions")
              .select("note_owner_id, emoji, note_created_at")
              .eq("reactor_id", me.id)
              .in("note_owner_id", others.map((o) => o.user_id))
          : Promise.resolve({ data: [] as any[] }),
        self
          ? supabase
              .from("note_reactions")
              .select("reactor_id, emoji")
              .eq("note_owner_id", me.id)
              .eq("note_created_at", self.created_at)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (!active) return;

      // Keep only reactions on the note instance currently shown.
      const currentByOwner = new Map(others.map((o) => [o.user_id, o.created_at]));
      const mine = new Map<string, string>();
      (mineRes.data ?? []).forEach((r: any) => {
        if (currentByOwner.get(r.note_owner_id) === r.note_created_at) mine.set(r.note_owner_id, r.emoji);
      });
      setMyReactions(mine);

      const rows = (onMineRes.data ?? []) as { reactor_id: string; emoji: string }[];
      if (rows.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_hue, avatar_url")
          .in("id", rows.map((r) => r.reactor_id));
        if (!active) return;
        const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
        setReactionsOnMine(
          rows.map((r) => {
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
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function react(note: NoteRow, emoji: string) {
    const prev = myReactions.get(note.user_id) ?? null;
    haptics.select();
    setReactTarget(null);

    if (prev === emoji) {
      // Same emoji again = remove the reaction.
      setMyReactions((m) => { const n = new Map(m); n.delete(note.user_id); return n; });
      const { error } = await supabase
        .from("note_reactions").delete()
        .eq("note_owner_id", note.user_id).eq("reactor_id", me.id);
      if (error) setMyReactions((m) => new Map(m).set(note.user_id, emoji));
      return;
    }

    setMyReactions((m) => new Map(m).set(note.user_id, emoji));
    const { error } = await supabase.from("note_reactions").upsert(
      { note_owner_id: note.user_id, reactor_id: me.id, emoji, note_created_at: note.created_at },
      { onConflict: "note_owner_id,reactor_id" },
    );
    if (error) {
      setMyReactions((m) => {
        const n = new Map(m);
        prev ? n.set(note.user_id, prev) : n.delete(note.user_id);
        return n;
      });
      return;
    }
    // Quiet ping for the owner — only on a fresh reaction, not emoji swaps.
    if (!prev) {
      await supabase.from("notifications").insert({
        user_id: note.user_id, actor_id: me.id, type: "note_reaction",
        target_type: "profile", target_id: note.user_id,
        body: `reacted ${emoji} to your note`,
      });
    }
  }

  function onPressStart(note: NoteRow) {
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      haptics.tap();
      setReactTarget(note);
    }, LONG_PRESS_MS);
  }
  function onPressEnd(note: NoteRow) {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
    if (!longPressFired.current) {
      // Music notes play their preview on tap; reply stays one long-press away.
      const t = parseTrack(note.track);
      if (t) {
        haptics.tap();
        playPreview(t);
      } else {
        reply(note);
      }
    }
  }
  function onPressCancel() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  // Cluster preview for my own note: up to 3 distinct emojis + count.
  const clusterEmojis = [...new Set(reactionsOnMine.map((r) => r.emoji))].slice(0, 3);

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
            <div className="flex max-w-[72px] items-center gap-1 rounded-2xl rounded-bl-sm bg-surface px-2.5 py-1">
              {myNote?.track?.artwork && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={myNote.track.artwork} alt="" className="h-3.5 w-3.5 shrink-0 rounded-full object-cover" />
              )}
              <span className="truncate text-[11px] font-medium text-foreground">
                {myNote ? myNote.text : "Status…"}
              </span>
            </div>
            <div className="mt-1 flex justify-center">
              <div className="relative">
                <Avatar name={me.name} hue={me.hue} size={52} src={me.avatarUrl ?? undefined} />
                {!myNote && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-accent text-accent-ink">
                    <Plus size={12} strokeWidth={3} />
                  </span>
                )}
                {reactionsOnMine.length > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="See who reacted to your note"
                    onClick={(e) => { e.stopPropagation(); setReactorsOpen(true); }}
                    className="absolute -bottom-1 -right-1 flex items-center rounded-full border border-border bg-elevated px-1.5 py-0.5 text-[10px] leading-none shadow-md"
                  >
                    {clusterEmojis.join("")}
                    <span className="ml-0.5 font-bold text-foreground">{reactionsOnMine.length}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="max-w-[64px] truncate text-[11px] text-muted">Your status</span>
        </button>

        {/* Circle's notes — tap to reply, long-press to react */}
        {others.map((note) => {
          const label = note.display_name ?? note.username ?? "User";
          const myEmoji = myReactions.get(note.user_id);
          const noteTrack = parseTrack(note.track);
          const notePlaying = !!noteTrack && playingTrackId === noteTrack.id;
          return (
            <button
              key={note.user_id}
              type="button"
              onPointerDown={() => onPressStart(note)}
              onPointerUp={() => onPressEnd(note)}
              onPointerLeave={onPressCancel}
              onContextMenu={(e) => { e.preventDefault(); onPressCancel(); setReactTarget(note); }}
              disabled={!!opening}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 disabled:opacity-60"
            >
              <div
                className={`relative max-w-[72px] rounded-2xl rounded-bl-sm bg-surface px-2.5 py-1 ${
                  notePlaying ? "ring-1 ring-accent/50" : ""
                }`}
              >
                <span className="flex items-center gap-1">
                  {noteTrack?.artwork && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={noteTrack.artwork}
                      alt=""
                      className={`h-3.5 w-3.5 shrink-0 rounded-full object-cover ${
                        notePlaying ? "animate-[spin_4s_linear_infinite]" : ""
                      }`}
                    />
                  )}
                  <span className="block truncate text-[11px] font-medium text-foreground">{note.text}</span>
                </span>
                {myEmoji && (
                  <span className="absolute -bottom-1.5 -right-1 rounded-full border border-border bg-elevated px-1 text-[10px] leading-tight shadow-md">
                    {myEmoji}
                  </span>
                )}
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
        me={{ name: me.name, hue: me.hue, avatarUrl: me.avatarUrl }}
      />

      {/* Quick reaction picker (long-press on a friend's note) */}
      <BottomSheet open={!!reactTarget} onClose={() => setReactTarget(null)} title={reactTarget ? `React to ${reactTarget.display_name ?? reactTarget.username ?? "their"} note` : undefined}>
        {reactTarget && (
          <div className="flex flex-col gap-4 pb-4">
            <p className="rounded-2xl bg-surface px-3.5 py-2.5 text-sm text-foreground/85">“{reactTarget.text}”</p>
            <div className="flex justify-between px-1">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => react(reactTarget, e)}
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-transform active:scale-90 ${
                    myReactions.get(reactTarget.user_id) === e ? "bg-accent/15 ring-1 ring-accent/40" : "bg-surface"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { const t = reactTarget; setReactTarget(null); if (t) reply(t); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-white/[0.04]"
            >
              <MessageCircle size={15} /> Reply instead
            </button>
          </div>
        )}
      </BottomSheet>

      {/* Who reacted to my note */}
      <BottomSheet open={reactorsOpen} onClose={() => setReactorsOpen(false)} title="Reactions on your note">
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
