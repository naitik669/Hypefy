"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AD_CLIENT, AD_LAYOUT_KEY, AD_SLOT_FEED, adTest } from "@/lib/ads";
import { loadAdSense } from "@/lib/adsense";

/**
 * One AdSense in-feed unit.
 *
 * Everything Google touches is inside the <ins>, and nothing of ours is: the
 * script replaces its contents with a cross-origin iframe, which cannot be
 * restyled, read, or reconciled by React. That is why the "Sponsored" label
 * lives in AdFeedCard's header rather than anywhere in this file — the corner
 * of the creative is inside the iframe's territory, not ours.
 *
 * Memoised with primitive props only, because FeedList re-renders on every
 * page append and every hype, and the <ins> must survive all of it untouched.
 */

type Outcome = "pending" | "filled" | "empty";

/** Past this, treat silence as an ad that is never coming. */
const GIVE_UP_MS = 3500;

export const AdSenseUnit = memo(function AdSenseUnit({
  personalised,
  onEmpty,
}: {
  /** False for anyone we cannot confirm is 18+, including a null date of birth. */
  personalised: boolean;
  /** Called once when the slot will not fill, so the card can show a house ad. */
  onEmpty: () => void;
}) {
  const ref = useRef<HTMLModElement>(null);
  const [outcome, setOutcome] = useState<Outcome>("pending");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // The guard is a property of the NODE, not a ref.
    //
    // A useRef(false) is the usual answer and it is wrong here: under
    // StrictMode the effect runs, cleans up and runs again on the same fiber,
    // so a ref survives while the DOM node may not. You end up with a fresh,
    // never-pushed <ins> whose ref insists it was already pushed, and the slot
    // silently stays blank in development. Remove the ref to "fix" that and
    // production starts throwing "All 'ins' elements in the body already have
    // ads in them". data-adsbygoogle-status is stamped by AdSense on the
    // element it takes ownership of, so it is true exactly when it should be.
    if (el.dataset.adsbygoogleStatus) return;

    let live = true;

    // AdSense reports an unfilled slot by attribute rather than by callback.
    const mo = new MutationObserver(() => {
      const status = el.getAttribute("data-ad-status");
      if (!live) return;
      if (status === "unfilled") setOutcome("empty");
      else if (status === "filled") setOutcome("filled");
    });
    mo.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });

    const timer = setTimeout(() => {
      if (live) setOutcome((o) => (o === "pending" ? "empty" : o));
    }, GIVE_UP_MS);

    loadAdSense(AD_CLIENT)
      .then(() => {
        if (!live || el.dataset.adsbygoogleStatus) return;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      })
      .catch(() => {
        // Blocked, offline, or refused. A house card goes here instead. Not
        // reported anywhere: it is the expected outcome for a large share of
        // readers and would drown real errors.
        if (live) setOutcome("empty");
      });

    return () => {
      live = false;
      clearTimeout(timer);
      mo.disconnect();
    };
  }, []);

  useEffect(() => {
    if (outcome === "empty") onEmpty();
  }, [outcome, onEmpty]);

  return (
    <ins
      ref={ref}
      className="adsbygoogle block h-full w-full"
      style={{ display: "block" }}
      data-ad-format="fluid"
      data-ad-layout-key={AD_LAYOUT_KEY}
      data-ad-client={AD_CLIENT}
      data-ad-slot={AD_SLOT_FEED}
      // Non-personalised for anyone we cannot confirm is an adult. The app's
      // only age threshold is 13, so this is most readers.
      {...(personalised ? {} : { "data-tag-for-under-age-of-consent": "true" })}
      // Test creatives: served, rendered and measured like the real thing,
      // but never counted or paid. The only safe way to run this path outside
      // Production.
      {...(adTest() ? { "data-adtest": "on" } : {})}
    />
  );
});
