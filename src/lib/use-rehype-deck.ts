"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchDeck, fetchMe, seatDeck, type DeckPerson, type RehypeKind } from "@/lib/rehype";

type Deck = { others: DeckPerson[]; me: DeckPerson | null };
const EMPTY: Deck = { others: [], me: null };

/**
 * Who sits in a post's or Shot's rehype deck, for the given rehype state.
 *
 * Loads the ranked deck and your own face together. Your face comes from a
 * per-session cache, so once you rehype you are seated on the same frame as
 * the tap — nothing waits on the network, and an undo is just as instant.
 * `enabled` lets a feed load only what is on or near the screen.
 */
export function useRehypeDeck(
  kind: RehypeKind,
  targetId: string,
  userId: string | null | undefined,
  rehyped: boolean,
  enabled = true,
): DeckPerson[] {
  const [deck, setDeck] = useState<Deck>(EMPTY);
  const [self, setSelf] = useState<DeckPerson | null>(null);

  useEffect(() => {
    if (!userId || !enabled) return;
    let live = true;
    const supabase = createClient();
    void Promise.all([fetchDeck(supabase as never, kind, targetId), fetchMe(supabase as never, userId)]).then(
      ([d, me]) => {
        if (!live) return;
        setDeck(d);
        setSelf(me);
      },
    );
    return () => {
      live = false;
    };
  }, [kind, targetId, userId, enabled]);

  return useMemo(() => seatDeck(deck.others, deck.me ?? self, rehyped), [deck, self, rehyped]);
}
