"use client";

import { useEffect, useMemo, useState } from "react";
import { Music, PenLine, Plus, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";
import { DiaryViewer } from "@/components/diary/DiaryViewer";
import {
  loadSeen,
  markSeen,
  timeLeft,
  unseen,
  type DiaryEntry,
} from "@/lib/diary";

type Me = { name: string; hue: number; avatarUrl: string | null };

const NO_FRESH = new Set<string>();

/**
 * The Diary page: yours first, then your circle's, two to a row.
 *
 * Cards rather than a list because a Diary is a thing to glance across, the
 * way a row of Shows is — you are looking for who wrote something, not
 * reading them in order. The layout is the sketch's: your card top-left, with
 * "Leave your Diary" when you have not, and everyone else's filling the grid.
 */
export function DiaryGrid({
  entries: initial,
  me,
  currentUserId,
}: {
  entries: DiaryEntry[];
  me: Me;
  currentUserId: string;
}) {
  const [entries, setEntries] = useState(initial);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewing, setViewing] = useState<DiaryEntry | null>(null);

  const mine = entries.find((e) => e.isSelf) ?? null;

  // What was new when you arrived. Captured once, before this visit marks
  // everything seen, so the rings stay put while you are here rather than
  // vanishing the instant the page loads.
  //
  // Read after mount on purpose: seen state lives in localStorage, which the
  // server cannot see, and deciding it during render would give the server
  // and the browser two different grids to reconcile.
  const [fresh, setFresh] = useState<Set<string>>(NO_FRESH);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage; see above
    setFresh(new Set(unseen(initial, loadSeen()).map((e) => e.userId)));
    markSeen(initial);
  }, [initial]);

  // New ones first, then newest. A Diary you have already read is still
  // worth showing, but not ahead of one you have not.
  const others = useMemo(
    () =>
      entries
        .filter((e) => !e.isSelf)
        .sort((a, b) => {
          const fa = fresh.has(a.userId) ? 1 : 0;
          const fb = fresh.has(b.userId) ? 1 : 0;
          if (fa !== fb) return fb - fa;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [entries, fresh]
  );

  function onSaved(note: MyNote) {
    setEntries((prev) => {
      const rest = prev.filter((e) => !e.isSelf);
      if (!note) return rest;
      const self: DiaryEntry = {
        userId: currentUserId,
        text: note.text,
        audience: note.audience,
        createdAt: new Date().toISOString(),
        isSelf: true,
        name: me.name,
        username: null,
        hue: me.hue,
        avatarUrl: me.avatarUrl,
        track: note.track,
      };
      return [self, ...rest];
    });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 px-4 pb-24 pt-2">
        {/* ── Yours ── */}
        {mine ? (
          <DiaryCard
            entry={mine}
            label="You"
            onOpen={() => setEditorOpen(true)}
            corner={
              <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-elevated text-muted">
                <PenLine size={13} />
              </span>
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-border bg-surface/60 p-3 transition-transform active:scale-[0.98]"
          >
            <Avatar name={me.name} hue={me.hue} size={60} src={me.avatarUrl ?? undefined} />
            <span className="text-sm font-bold">You</span>
            <span className="flex items-center gap-1 rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink">
              <Plus size={13} strokeWidth={3} /> Leave your Diary
            </span>
          </button>
        )}

        {/* ── Theirs ── */}
        {others.map((e) => (
          <DiaryCard
            key={e.userId}
            entry={e}
            label={e.name}
            fresh={fresh.has(e.userId)}
            onOpen={() => setViewing(e)}
          />
        ))}

        {/* Nobody else has one. The sketch's empty squares, kept as a
            promise of what goes here rather than a blank page. */}
        {others.length === 0 && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden
                className="aspect-[4/5] rounded-[28px] border border-dashed border-border/60"
              />
            ))}
            <p className="col-span-2 px-6 pt-2 text-center text-sm leading-snug text-faint">
              When people you follow back leave a Diary, it shows up here for 24
              hours.
            </p>
          </>
        )}
      </div>

      <NoteEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        current={mine ? { text: mine.text, audience: mine.audience, track: mine.track } : null}
        onSaved={onSaved}
        me={me}
        title={mine ? "Your Diary" : "Leave your Diary"}
        subtitle="your circle sees it for 24 hours"
      />

      <DiaryViewer
        entry={viewing}
        currentUserId={currentUserId}
        onClose={() => setViewing(null)}
      />
    </>
  );
}

function DiaryCard({
  entry,
  label,
  fresh = false,
  onOpen,
  corner,
}: {
  entry: DiaryEntry;
  label: string;
  fresh?: boolean;
  onOpen: () => void;
  corner?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative flex aspect-[4/5] flex-col items-center gap-2 rounded-[28px] border bg-surface p-3 text-center transition-transform active:scale-[0.98] ${
        fresh ? "border-accent" : "border-border"
      }`}
    >
      {fresh && (
        <span
          aria-label="New"
          className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-accent"
        />
      )}
      {entry.audience === "close" && (
        <span
          aria-label="Close friends"
          className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent"
        >
          <Star size={11} fill="currentColor" />
        </span>
      )}
      {corner}

      <Avatar name={entry.name} hue={entry.hue} size={52} src={entry.avatarUrl ?? undefined} />
      <div className="w-full min-w-0 leading-tight">
        <p className="truncate text-sm font-bold">{label}</p>
        {/* Clock-dependent: the server and the browser can straddle an hour. */}
        <p className="text-[11px] text-faint" suppressHydrationWarning>
          {timeLeft(entry.createdAt)}
        </p>
      </div>

      <p className="line-clamp-4 w-full flex-1 break-words rounded-2xl rounded-tl-md bg-elevated px-2.5 py-2 text-[13px] font-semibold leading-snug">
        {entry.text}
      </p>

      {entry.track && (
        <p className="flex w-full min-w-0 items-center justify-center gap-1 text-[11px] text-muted">
          <Music size={11} className="shrink-0" />
          <span className="truncate">{entry.track.title}</span>
        </p>
      )}
    </button>
  );
}
