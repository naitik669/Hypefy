"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CenterModal } from "@/components/ui/CenterModal";
import { DiaryEditor, type DiaryDraft } from "@/components/diary/DiaryEditor";
import { DiaryTile, WriteTile } from "@/components/diary/DiaryTile";
import { YourDiaryCard } from "@/components/diary/YourDiaryCard";
import { DiaryStack } from "@/components/diary/DiaryStack";
import { DiaryStories } from "@/components/diary/DiaryStories";
import { DiaryArchiveSheet } from "@/components/diary/DiaryArchiveSheet";
import { ReactionsSheet } from "@/components/diary/PageReactions";
import {
  loadSeen,
  markReactionsFlown,
  markSeen,
  newReactions,
  storyOrder,
  unseen,
  type DiaryEntry,
  type DiaryReaction,
} from "@/lib/diary";

type Me = { name: string; hue: number; avatarUrl: string | null };

const NO_FRESH = new Set<string>();
const NONE: DiaryReaction[] = [];

/**
 * Pages — one tap from Messages.
 *
 * Top, the spotlight: everyone else's pages as a deck of cards, the one in
 * front complete and usable where it lies (its song playing by itself), the
 * next two fanned out behind; swipe to send it to the back. Below, every page
 * at once as a grid — yours first (or a plus to write one), then everyone's.
 * Reactions to yours float up over it when they are new; the tab on it says
 * who sent what. Past pages are the icon at the top right. As few words on
 * the screen as will do.
 */
export function DiaryHome({
  entries: initial,
  me,
  currentUserId,
  reactionsOnMine: initialReactions,
  hypesOnMine: initialHypes = NONE,
  myReactions: initialMine,
  myHypes: initialMyHypes = [],
}: {
  entries: DiaryEntry[];
  me: Me;
  currentUserId: string;
  reactionsOnMine: DiaryReaction[];
  /** Hypes on your current page, as reactions with a star. */
  hypesOnMine?: DiaryReaction[];
  /** Your reaction per friend, for pages you have already reacted to. */
  myReactions: Record<string, string>;
  /** Friends whose current page you have hyped. */
  myHypes?: string[];
}) {
  const [entries, setEntries] = useState(initial);
  const [onMine, setOnMine] = useState(() => [...initialReactions, ...initialHypes].sort((a, b) => b.at.localeCompare(a.at)));
  const [reacted, setReacted] = useState(initialMine);
  const [hyped, setHyped] = useState<Set<string>>(() => new Set(initialMyHypes));
  const [editing, setEditing] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [storyAt, setStoryAt] = useState<number | null>(null);

  const mine = entries.find((e) => e.isSelf) ?? null;

  // What was new when you arrived — read after mount (it lives in
  // localStorage, which the server cannot see), then everything is marked
  // seen for next time. Captured once so the dots stay put while you read.
  // The same for reactions to your page: the new ones float up, once.
  const [fresh, setFresh] = useState<Set<string>>(NO_FRESH);
  const [flying, setFlying] = useState<DiaryReaction[]>(NONE);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage; see above
    setFresh(new Set(unseen(initial, loadSeen()).map((e) => e.userId)));
    markSeen(initial);
  }, [initial]);
  const minePage = initial.find((e) => e.isSelf)?.createdAt ?? null;
  // Once per page: reading "what is new" also marks it seen, so a second run
  // (React runs effects twice in development) would find nothing new.
  const flewFor = useRef<string | null>(null);
  useEffect(() => {
    if (!minePage || flewFor.current === minePage) return;
    flewFor.current = minePage;
    const all = [...initialReactions, ...initialHypes];
    setFlying(newReactions(minePage, all));
    markReactionsFlown(minePage, all);
  }, [minePage, initialReactions, initialHypes]);

  const others = useMemo(() => storyOrder(entries, fresh), [entries, fresh]);

  function onSaved(draft: DiaryDraft) {
    // A saved page is a new one: reactions and hypes were to the old one.
    setOnMine([]);
    setFlying(NONE);
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

  function onHyped(userId: string, on: boolean) {
    setHyped((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Pages"
        showBack
        right={
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            aria-label="Past pages"
            className="mr-1 flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-white/[0.07] hover:text-foreground"
          >
            <Archive size={20} />
          </button>
        }
      />
      <div className="flex flex-col gap-3 px-3 pb-24 pt-4">
        {/* ── The spotlight ── */}
        {others.length > 0 && (
          <DiaryStack
            list={others}
            fresh={fresh}
            reacted={reacted}
            onReacted={onReacted}
            hyped={hyped}
            onHyped={onHyped}
            onOpen={(i) => setStoryAt(i)}
          />
        )}

        {/* ── Every page, at once ── */}
        <div className={`grid grid-cols-2 gap-3 ${others.length > 0 ? "pt-5" : ""}`}>
          {mine ? (
            <DiaryTile
              entry={mine}
              label="You"
              reactions={onMine}
              flying={flying}
              onReactions={() => setWhoOpen(true)}
              onOpen={() => setMineOpen(true)}
            />
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
      </div>

      {/* Your page, opened from your tile. */}
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
      <ReactionsSheet open={whoOpen} onClose={() => setWhoOpen(false)} reactions={onMine} />
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
          hyped={hyped}
          onHyped={onHyped}
        />
      )}
    </>
  );
}
