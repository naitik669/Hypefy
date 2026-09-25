"use client";

import { useEffect, useRef, useState } from "react";
import { fetchHypeProof, type HypeProof, type HypeTarget } from "@/lib/hype-proof";

/**
 * Proof for a whole feed page, in one call.
 *
 * Lives at the list rather than on the card on purpose: a card that fetched
 * its own would make ten round trips a screen, and a feed that grows by
 * twenty on every scroll would make twenty more. This asks only about ids it
 * has not already asked about, and keeps the answers for ids that scroll away
 * so coming back is free.
 *
 * Cards with no answer draw exactly as they did before — the line is a
 * garnish, never a thing to wait for.
 */
export function useHypeProof(targetType: HypeTarget, ids: string[]): Map<string, HypeProof> {
  const [proof, setProof] = useState<Map<string, HypeProof>>(() => new Map());
  // Every id already asked about, answered or not. A target with no friends
  // on it returns no row, and without this it would be re-asked forever.
  const asked = useRef(new Set<string>());

  // A stable key, so a re-render that produces an equal array does not refetch.
  const key = ids.join(",");

  useEffect(() => {
    const fresh = ids.filter((id) => id && !asked.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) asked.current.add(id);

    let cancelled = false;
    void fetchHypeProof(targetType, fresh).then((found) => {
      if (cancelled || found.size === 0) return;
      setProof((prev) => {
        const next = new Map(prev);
        for (const [id, p] of found) next.set(id, p);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // `ids` is rebuilt every render; `key` is what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, key]);

  return proof;
}
