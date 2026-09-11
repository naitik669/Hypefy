"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CenterModal } from "@/components/ui/CenterModal";
import { DiaryEditor, type DiaryDraft } from "@/components/diary/DiaryEditor";
import { DiaryTile, WriteTile } from "@/components/diary/DiaryTile";
import { YourDiaryCard } from "@/components/diary/YourDiaryCard";
import { DiaryStack } from "@/components/diary/DiaryStack";
import { DiaryStories } from "@/components/diary/DiaryStories";
import { DiaryArchiveSheet } from "@/components/diary/DiaryArchiveSheet";
import {
  loadSeen,
  markSeen,
  storyOrder,
  unseen,
  type DiaryEntry,
  type DiaryReaction,
} from "@/lib/diary";

type Me = { name: string; hue: number; avatarUrl: string | null };

const NO_FRESH = new Set<string>();

/**
 * The Diary page — one tap from Messages.
 *
 * Top, the spotlight: everyone else's Diaries as a deck of cards, the one in
 * front complete and usable where it lies (its song playing by itself), the
 * next two fanned out behind; swipe to send it to the back. Scroll a little
 * and every Diary is there at once as a grid — yours first (or a blank one to
 * write), then everyone's — each opening full-screen. Past Diaries are a
 * small box at the top right.
 */
export function DiaryHome({
  entries: initial,
  me,
  currentUserId,
  reactionsOnMine: initialReactions,
  myReactions: initialMine,
  archiveCount: initialArchiveCount,
}: {
  entries: DiaryEntry[];
  me: Me;
  currentUserId: string;
  reactionsOnMine: DiaryReaction[];
  /** Your reaction per friend, for Diaries you have already reacted to. */
  myReactions: Record<string, string>;
  archiveCount: number;
}) {
  const [entries, setEntries] = useState(initial);
  const [onMine, setOnMine] = useState(initialReactions);
  const [reacted, setReacted] = useState(initialMine);
  const [archiveCount, setArchiveCount] = useState(initialArchiveCount);
  const [editing, setEditing] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [storyAt, setStoryAt] = useState<number | null>(null);

  // What was new when you arrived — read after mount (it lives in
  // localStorage, which the server cannot see), then everything is marked
  // seen for next time. Captured once so the dots stay put while you read.
  const [fresh, setFresh] = useState<Set<string>>(NO_FRESH);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage; see above
    setFresh(new Set(unseen(initial, loadSeen()).map((e) => e.userId)));
    markSeen(initial);
  }, [initial]);

  const mine = entries.find((e) => e.isSelf) ?? null;
  const others = useMemo(() => storyOrder(entries, fresh), [entries, fresh]);
  const newCount = others.filter((e) => fresh.has(e.userId)).length;

  function onSaved(draft: DiaryDraft) {
    // Anything you had goes to your archive — replaced or taken down.
    if (mine) setArchiveCount((n) => n + 1);
    // A saved Diary is a new one: reactions were to the old one.
    setOnMine([]);
    setEntries((prev) => {
      const rest = prev.filter((e) => !e.isSelf);
      if (!draft) return rest;
      return [
        {
          userId: currentUserId,
          text: draft.text,
          audience: draft.audience,
          createdAt: new Date().toISOString(),
          isSelf: true,
          name: me.name,
          username: null,
          hue: me.hue,
          avatarUrl: me.avatarUrl,
          track: draft.track,
          color: draft.color,
        },
        ...rest,
      ];
    });
  }

  function onReacted(userId: string, emoji: string | null) {
    setReacted((prev) => {
      const next = { ...prev };
      if (emoji) next[userId] = emoji;
      else delete next[userId];
      return next;
    });
  }

  // Past Diaries: a small box at the top right — the least urgent thing on
  // the page, so it stays out of the way of anyone's Diary.
  const pastBox = (
    <button
      type="button"
      onClick={() => setArchiveOpen(true)}
      aria-label={archiveCount > 0 ? `Past Diaries, ${archiveCount} kept` : "Past Diaries"}
      className="mr-1 flex h-9 items-center gap-1.5 rounded-xl bg-white/[0.07] pl-2.5 pr-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-white/[0.11]"
    >
      <Archive size={15} className="text-white/75" />
      Past
      {archiveCount > 0 && (
        <span className="min-w-5 rounded-md bg-white/10 px-1 text-center text-[11px] font-bold tabular-nums">
          {archiveCount}
        </span>
      )}
    </button>
  );

  return (
    <>
      <PageHeader title="Diary" showBack right={pastBox} />
      <div className="flex flex-col gap-3 px-3 pb-24 pt-2">
        <p className="px-1 text-[13px] text-muted">
          {others.length === 0 ? (
            "Short notes from your circle. Each one lasts a day."
          ) : newCount > 0 ? (
            <>
              <span className="font-semibold text-accent">{newCount} new</span> · each one lasts a day
            </>
          ) : (
            `${others.length} from your circle today · each one lasts a day`
          )}
        </p>

        {/* ── The spotlight ── */}
        {others.length > 0 && (
          <div className="pt-3">
            <DiaryStack
              list={others}
              fresh={fresh}
              reacted={reacted}
              onReacted={onReacted}
              onOpen={(i) => setStoryAt(i)}
            />
          </div>
        )}

        {/* ── Everyone, at once ── */}
        <h2 className="px-1 pt-4 text-xs font-bold uppercase tracking-[0.08em] text-muted">All Diaries</h2>
        <div className="grid grid-cols-2 gap-3">
          {mine ? (
            <DiaryTile entry={mine} label="You" reactions={onMine} onOpen={() => setMineOpen(true)} />
          ) : (
            <WriteTile me={me} onWrite={() => setEditing(true)} />
          )}
          {others.map((e, i) => (
            <DiaryTile
              key={e.userId}
              entry={e}
              label={e.name}
              fresh={fresh.has(e.userId)}
              onOpen={() => setStoryAt(i)}
            />
          ))}
        </div>
        {others.length === 0 && (
          <p className="px-6 py-4 text-center text-sm leading-snug text-faint">
            When people you follow back write a Diary, it shows up here.
          </p>
        )}
      </div>

      {/* Your Diary, opened from your tile: the page, and everyone who reacted. */}
      <CenterModal open={mineOpen && !!mine} onClose={() => setMineOpen(false)}>
        {mine && (
          <YourDiaryCard
            entry={mine}
            reactions={onMine}
            onEdit={() => {
              setMineOpen(false);
              setEditing(true);
            }}
          />
        )}
      </CenterModal>
      <DiaryEditor
        open={editing}
        onClose={() => setEditing(false)}
        current={mine ? { text: mine.text, audience: mine.audience, track: mine.track, color: mine.color } : null}
        onSaved={onSaved}
        me={me}
      />
      <DiaryArchiveSheet open={archiveOpen} onClose={() => setArchiveOpen(false)} hue={me.hue} />
      {storyAt !== null && (
        <DiaryStories
          list={others}
          start={storyAt}
          onClose={() => setStoryAt(null)}
          myReactions={reacted}
          onReacted={onReacted}
        />
      )}
    </>
  );
}
