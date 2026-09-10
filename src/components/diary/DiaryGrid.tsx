"use client";

import { useEffect, useMemo, useState } from "react";
import { PenLine } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DiaryPage } from "@/components/diary/DiaryPage";
import { DiaryEditor, type DiaryDraft } from "@/components/diary/DiaryEditor";
import { DiaryViewer } from "@/components/diary/DiaryViewer";
import { loadSeen, markSeen, unseen, type DiaryEntry } from "@/lib/diary";

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

  function onSaved(note: DiaryDraft) {
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

  const newCount = fresh.size;

  return (
    <>
      {/* One quiet line of context under the title: what this is, and how
          many are new — the only place a count belongs. */}
      <p className="px-4 pb-3 text-[13px] text-muted">
        {others.length === 0
          ? "Pages from your circle, gone after a day."
          : newCount > 0
            ? <><span className="font-semibold text-accent">{newCount} new</span> · gone after a day</>
            : `${others.length} ${others.length === 1 ? "page" : "pages"} today · gone after a day`}
      </p>

      <div className="grid grid-cols-2 gap-2.5 px-4 pb-24">
        {/* ── Yours ── */}
        {mine ? (
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            aria-label="Edit your Diary"
            className="relative text-left transition-transform active:scale-[0.97]"
          >
            <DiaryPage entry={mine} label="You" />
            <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm">
              <PenLine size={13} />
            </span>
          </button>
        ) : (
          // A blank page: the one card with nothing written on it yet, and
          // the only lime in the grid that is not saying "new".
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="group relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[26px] border border-dashed border-white/15 bg-white/[0.025] p-3.5 text-left transition-colors active:scale-[0.97] hover:border-accent/50"
          >
            <span className="text-[22px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white/30">
              What&apos;s on your mind today?
            </span>
            <span className="flex items-center gap-1.5">
              <Avatar name={me.name} hue={me.hue} size={20} src={me.avatarUrl ?? undefined} />
              <span className="text-xs font-semibold text-white/90">You</span>
              <span className="ml-auto flex h-7 items-center gap-1 rounded-pill bg-accent px-2.5 text-[11px] font-extrabold text-accent-ink">
                <PenLine size={11} strokeWidth={2.6} /> Write
              </span>
            </span>
          </button>
        )}

        {/* ── Theirs ── */}
        {others.map((e) => (
          <button
            key={e.userId}
            type="button"
            onClick={() => setViewing(e)}
            aria-label={`${e.name}'s Diary`}
            className="text-left transition-transform active:scale-[0.97]"
          >
            <DiaryPage entry={e} label={e.name} fresh={fresh.has(e.userId)} />
          </button>
        ))}

        {/* Nobody else has written one: faint blank pages, and one line
            saying whose will appear there. */}
        {others.length === 0 && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden
                className="aspect-[4/5] rounded-[26px] border border-dashed border-white/[0.07]"
              />
            ))}
            <p className="col-span-2 px-6 pt-3 text-center text-sm leading-snug text-faint">
              When people you follow back write a Diary, their pages appear here.
            </p>
          </>
        )}
      </div>

      <DiaryEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        current={mine ? { text: mine.text, audience: mine.audience, track: mine.track } : null}
        onSaved={onSaved}
        me={me}
      />

      <DiaryViewer
        entry={viewing}
        currentUserId={currentUserId}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
