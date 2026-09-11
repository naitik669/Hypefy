"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DiaryComposer, DiaryEditor, type DiaryDraft } from "@/components/diary/DiaryEditor";
import { DiscSleeve } from "@/components/diary/DiaryDisc";
import { FriendDiaryCard } from "@/components/diary/FriendDiaryCard";
import { YourDiaryCard } from "@/components/diary/YourDiaryCard";
import { DiaryStack } from "@/components/diary/DiaryStack";
import { DiaryStories } from "@/components/diary/DiaryStories";
import { DiaryArchiveSheet } from "@/components/diary/DiaryArchiveSheet";
import { FloatingReactions } from "@/components/diary/PageReactions";
import type { DiaryColor } from "@/components/diary/DiaryPage";
import { createClient } from "@/lib/supabase/client";
import {
  loadSeen,
  markReactionsFlown,
  markSeen,
  newReactions,
  startFrom,
  storyOrder,
  unseen,
  type DiaryEntry,
  type DiaryReaction,
} from "@/lib/diary";

type Me = { name: string; hue: number; avatarUrl: string | null };

const NO_FRESH = new Set<string>();
const NONE: DiaryReaction[] = [];

/** The first screen, exactly: all of the window between the header and the tab bar. */
const SPOTLIGHT_HEIGHT =
  "calc(100dvh - 3.5rem - 72px - env(safe-area-inset-top) - env(safe-area-inset-bottom))";

/**
 * Spotlight — the screen of pages, one tap from Messages.
 *
 * The first screen is the spotlight: everyone else's pages as a deck of
 * cards in the middle of it, the one in front complete and usable where it
 * lies (its song playing by itself), the next two fanned out behind; swipe
 * to send it to the back. Scroll, and every page is there one to a row —
 * yours first (or the page to write one on), then everyone's. With nobody
 * else's page up, the spotlight is yours: your page, or the one to write. Reactions to
 * yours float up over it when they are new; the tab on it says who sent what. Past pages are the icon at the top right. As few words on
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
  startAt = null,
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
  /** Whose page the deck opens on (?page= in the URL); the newest if unset. */
  startAt?: string | null;
}) {
  const [entries, setEntries] = useState(initial);
  const [onMine, setOnMine] = useState(() => [...initialReactions, ...initialHypes].sort((a, b) => b.at.localeCompare(a.at)));
  const [reacted, setReacted] = useState(initialMine);
  const [hyped, setHyped] = useState<Set<string>>(() => new Set(initialMyHypes));
  const [editing, setEditing] = useState(false);
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

  // Opened from a page tapped in Messages: the deck starts on it.
  const others = useMemo(() => startFrom(storyOrder(entries, fresh), startAt), [entries, fresh, startAt]);

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

  // Recolour your page in place: shown at once, put back if the server says no.
  async function onColor(color: DiaryColor) {
    const before = mine?.color ?? null;
    const paint = (c: string | null) => setEntries((prev) => prev.map((e) => (e.isSelf ? { ...e, color: c } : e)));
    paint(color);
    const { error } = await createClient().rpc("set_note_color", { p_color: color });
    if (error) paint(before);
  }

  function onHyped(userId: string, on: boolean) {
    setHyped((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  // Your page — or the page to write one on. At the head of the list, or in
  // the spotlight itself when there is nobody else's to show there.
  const alone = others.length === 0;
  const yours = mine ? (
    <div className="relative">
      <YourDiaryCard entry={mine} reactions={onMine} onEdit={() => setEditing(true)} onColor={onColor} />
      <FloatingReactions reactions={flying} />
    </div>
  ) : (
    <section aria-label="Write your page">
      <DiaryComposer current={null} me={me} onSaved={onSaved} compact />
    </section>
  );

  return (
    <>
      <PageHeader
        title="Spotlight"
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
      <div className="flex flex-col px-3 pb-24">
        {/* ── The spotlight: the whole first screen ── */}
        <section
          aria-label="Deck"
          // Edge to edge, clipped there: the CD peeks right up to the side of
          // the screen and must not scroll the page sideways when it grows.
          // Isolated, so the light can sit behind the deck.
          className="relative isolate -mx-3 flex flex-col justify-center overflow-x-clip px-3 py-4"
          style={{
            minHeight: SPOTLIGHT_HEIGHT,
            // Only a little taller than it is wide — a tenth — so it reads as a
            // card, not a column. Its width is the screen less the margins
            // (2 × (12 + 40)px); a very short screen can take it down to 260px.
            ["--card-h" as string]: `clamp(260px, calc((min(100vw, 480px) - 104px) * 1.1), calc(${SPOTLIGHT_HEIGHT} - 250px))`,
          }}
        >
          {/* A light from above, onto the deck — just a touch. */}
          <div aria-hidden className="pages-spotlight pointer-events-none absolute inset-0 -z-10" />
          {alone ? (
            // Nobody else has a page up: the light falls on yours — or on
            // the page to write it on.
            <div className="mx-auto w-full max-w-[360px] px-2">{yours}</div>
          ) : (
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
        </section>

        {/* ── Every page, one to a row ── */}
        {/* Clipped at the screen edge too: a big CD playing slides out a little. */}
        {!alone && (
          <div className="-mx-3 flex flex-col gap-4 overflow-x-clip px-3 pt-4">
            {yours}
            {others.map((e, i) => (
              <DiscSleeve key={e.userId} track={e.track}>
                <FriendDiaryCard
                  entry={e}
                  fresh={fresh.has(e.userId)}
                  mine={reacted[e.userId] ?? null}
                  onReacted={onReacted}
                  hyped={hyped.has(e.userId)}
                  onHyped={onHyped}
                  onOpen={() => setStoryAt(i)}
                  size="list"
                />
              </DiscSleeve>
            ))}
          </div>
        )}
      </div>

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
