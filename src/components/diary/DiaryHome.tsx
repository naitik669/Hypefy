"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronRight } from "lucide-react";
import { DiaryComposer, DiaryEditor, type DiaryDraft } from "@/components/diary/DiaryEditor";
import { YourDiaryCard } from "@/components/diary/YourDiaryCard";
import { FriendDiaryCard } from "@/components/diary/FriendDiaryCard";
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
 * The Diary page — one tap from Messages, and then nothing else to tap to
 * see what is here.
 *
 * Top to bottom: your Diary with everyone's reactions on it (or, if you have
 * not written one, the page to write it on, right there — no pop-up), your
 * past Diaries one row down, then everyone else's, each complete on its own
 * card: the note in full, the song playable, six reactions and a reply in
 * place. Swiping through them full-screen is there for when you want it; it
 * is never the only way to see or do anything.
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

  return (
    <div className="flex flex-col gap-3 px-3 pb-24">
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

      {/* ── Yours ── */}
      {mine ? (
        <YourDiaryCard entry={mine} reactions={onMine} onEdit={() => setEditing(true)} />
      ) : (
        <section aria-label="Write your Diary">
          <DiaryComposer current={null} me={me} onSaved={onSaved} compact />
        </section>
      )}


      {/* ── Theirs ── */}
      {others.length > 0 && (
        <h2 className="px-1 pt-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">From your circle</h2>
      )}
      {others.map((e, i) => (
        <FriendDiaryCard
          key={e.userId}
          entry={e}
          fresh={fresh.has(e.userId)}
          mine={reacted[e.userId] ?? null}
          onReacted={onReacted}
          onOpen={() => setStoryAt(i)}
        />
      ))}
      {others.length === 0 && (
        <p className="px-6 py-6 text-center text-sm leading-snug text-faint">
          When people you follow back write a Diary, it shows up here in full.
        </p>
      )}

      {/* Last: the least urgent thing on the page, one tap away and never in
          the way of anyone's Diary. */}
      <button
        type="button"
        onClick={() => setArchiveOpen(true)}
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-elevated"
      >
        <Archive size={17} className="text-muted" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">Past Diaries</span>
          <span className="block text-xs text-muted">
            {archiveCount > 0 ? `${archiveCount} kept · only you can see them` : "Kept here when a Diary ends · only you"}
          </span>
        </span>
        <ChevronRight size={17} className="text-muted" />
      </button>

      <DiaryEditor
        open={editing}
        onClose={() => setEditing(false)}
        current={mine ? { text: mine.text, audience: mine.audience, track: mine.track } : null}
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
    </div>
  );
}
