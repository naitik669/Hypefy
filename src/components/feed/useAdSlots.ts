"use client";

import { useState, useSyncExternalStore } from "react";
import {
  EMPTY_LANE,
  extendAdLane,
  type AdLane,
  type AdPlaceOpts,
  type PlacedAd,
} from "@/lib/feed-mix";
import { adBudgetLeft, adFill, type AdFill } from "@/lib/ads";
import { consentRevision, currentConsent, subscribeConsent } from "@/lib/consent";
import { isNative } from "@/lib/native";

const NO_ADS: PlacedAd[] = [];
const never = () => () => {};

/**
 * What fills an ad slot for this reader.
 *
 * "off" on the server and through hydration, the real answer only after,
 * because isNative() answers false during SSR — Capacitor is absent on the
 * server — which is exactly the wrong answer to act on. A slot decided there
 * would ship an ad tag into the Play Store app and then have to take it back.
 *
 * useSyncExternalStore rather than an effect that sets state: it is React's
 * own shape for "one value on the server, another in the browser", and it
 * does not render the page once with the wrong answer before correcting it.
 */
export function useAdFill(country: string | null): AdFill {
  // Subscribed to consent changes, so answering the cookie banner switches
  // the slots over at once rather than on the next page load.
  useSyncExternalStore(subscribeConsent, consentRevision, () => 0);
  return useSyncExternalStore(
    never,
    () =>
      adFill({
        country,
        native: isNative(),
        adsConsent: currentConsent(country).ads,
      }),
    () => "off"
  );
}

type SlotState = {
  resetKey: unknown;
  epoch: number;
  lanes: Record<string, AdLane>;
};

/**
 * Ad placements for a list that grows.
 *
 * Shared by the home feed and the Shots reel so both get the same three
 * guarantees, which were easy to get wrong separately:
 *
 *  - Append-only. An ad already on screen never moves or remounts; moving it
 *    means a second request and a double-counted impression.
 *  - New ads only land in content that just arrived — see extendAdLane for
 *    the bug that rule exists to prevent.
 *  - One set of placements per `lane`, so the home feed's four tabs each keep
 *    their own and switching between them loses nothing.
 *
 * `resetKey` starts every lane over when it changes identity. The home feed
 * passes the server's post array, which becomes a new object on a
 * pull-to-refresh: a new page view, where new creatives are correct.
 *
 * Derived during render, not synced through an effect. extendAdLane is pure
 * and returns the same lane when nothing changed, so this settles in one
 * extra render and is safe to run twice — which an effect writing a ref and
 * a state counter was not quite: under StrictMode it had to be argued safe,
 * where this is safe by construction.
 */
export function useAdSlots({
  fill,
  count,
  reserved,
  lane,
  resetKey,
  opts,
}: {
  fill: AdFill;
  count: number;
  reserved: readonly number[];
  lane: string;
  resetKey: unknown;
  opts?: AdPlaceOpts;
}): PlacedAd[] {
  const [state, setState] = useState<SlotState>(() => ({
    resetKey,
    epoch: 0,
    lanes: {},
  }));

  let next = state;

  if (next.resetKey !== resetKey) {
    next = { resetKey, epoch: next.epoch + 1, lanes: {} };
  }

  if (fill !== "off") {
    const current = next.lanes[lane] ?? EMPTY_LANE;
    const extended = extendAdLane(current, count, reserved, {
      ...opts,
      budget: adBudgetLeft(),
      // The epoch is in the id so a refresh mints new units rather than
      // reusing keys React would treat as the same, already-requested ones.
      idPrefix: `ad-${lane}-${next.epoch}-`,
    });
    if (extended !== current) {
      next = { ...next, lanes: { ...next.lanes, [lane]: extended } };
    }
  }

  // The documented pattern for state derived from a change in props: set it
  // during render, guarded so it only happens when something actually moved.
  if (next !== state) setState(next);

  return next.lanes[lane]?.ads ?? NO_ADS;
}
