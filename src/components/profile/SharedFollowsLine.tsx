"use client";

import { useEffect, useState } from "react";
import {
  fetchSharedFollows,
  SHARED_FOLLOWS_FLOOR,
  type SharedFollows,
} from "@/lib/hype-proof";

/**
 * "You both follow 5 of the same people", under the bio.
 *
 * No box, no icon, the same type as the bio — so it reads as one more fact
 * about the person rather than a verdict on the pair. A boxed stat with a
 * star reads as a score the app is awarding you, which is the one reading to
 * avoid on a 13+ app.
 *
 * Follows rather than shared taste, deliberately: shared follows say you move
 * in the same circles, which is safe to show anyone. Never a percentage,
 * never a bar, never the word match.
 */
export function SharedFollowsLine({ otherId }: { otherId: string }) {
  const [shared, setShared] = useState<SharedFollows | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchSharedFollows(otherId).then((s) => {
      if (alive) setShared(s);
    });
    return () => {
      alive = false;
    };
  }, [otherId]);

  // Under three, nothing. "1 of the same people" is worse than an empty
  // space: it invites the reader to notice how little there is.
  if (!shared || shared.count < SHARED_FOLLOWS_FLOOR) return null;

  return (
    <p className="mt-1.5 text-sm leading-snug text-muted">
      You both follow{" "}
      <span className="font-bold text-foreground">{shared.count} of the same people</span>
    </p>
  );
}
