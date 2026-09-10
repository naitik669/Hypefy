"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { AD_RESERVED_PX, type AdFill } from "@/lib/ads";
import { AdImpression } from "@/components/feed/AdImpression";
import { AdSenseUnit } from "@/components/feed/AdSenseUnit";
import { HouseSponsoredCard } from "@/components/feed/HouseSponsoredCard";

/**
 * An ad, wearing a post's clothes.
 *
 * The geometry is FeedCard's, deliberately and exactly: the same article
 * border, the same px-4 py-3 header with a 40px mark, the same mx-4
 * rounded-2xl media box. An ad that is a different shape from its neighbours
 * announces itself as an ad before anyone reads it, and then the reader learns
 * to skip that shape.
 *
 * Three departures, each for a reason:
 *
 *  - The avatar slot is Hypefy's mark, never the advertiser's. Putting a brand
 *    where an author goes is exactly the impersonation the Sponsored chip
 *    exists to prevent.
 *  - No action row. A Hype and a Comment button under an ad say it is a post
 *    you can talk to. That space carries the disclosure instead.
 *  - No ⋯ menu. FeedCard's opens a sheet keyed on a post id, and there is no
 *    honest ad equivalent yet — "Hide this ad" is a real feature, not a stub.
 *
 * The label is OURS, and it is outside the unit. AdSense replaces the <ins>
 * with a cross-origin iframe: anything we put inside is either destroyed by
 * Google or destroys Google's insertion on the next reconcile. The header is
 * the only place a label can live, and it is also where the label belongs.
 */

export function AdFeedCard({
  ad,
  fill,
  personalised,
  onSeen,
}: {
  ad: { id: string; index: number };
  fill: AdFill;
  personalised: boolean;
  onSeen: (adId: string) => void;
}) {
  const [empty, setEmpty] = useState(false);
  const handleEmpty = useCallback(() => setEmpty(true), []);

  // Request the ad when the card is about to scroll into view, not when it is
  // placed. Placement happens a page ahead, so an eager unit asks Google for
  // an ad the reader may never scroll to — wasted inventory, and the kind of
  // viewability that gets a site's fill rate throttled. The box below is a
  // fixed height either way, so arming late costs no layout shift. Once armed
  // it stays armed; unmounting on the way past would request it again.
  const boxRef = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver there is nothing to wait for, so start
  // armed rather than never arming at all.
  const [armed, setArmed] = useState(
    () => typeof IntersectionObserver === "undefined"
  );
  useEffect(() => {
    if (armed) return;
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          io.disconnect();
        }
      },
      // About one screen ahead: enough for the creative to arrive before the
      // card does, not so much that it arms ads nobody reaches.
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  const house = fill !== "adsense" || empty;

  return (
    <article
      className="relative border-b border-border/50 pb-3"
      data-ad-card
      data-ad-fill={house ? "house" : "adsense"}
    >
      <AdImpression adId={ad.id} onSeen={onSeen} />

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[30%] bg-surface text-muted">
          <Megaphone size={18} />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-sm font-semibold">
            {house ? "From Hypefy" : "Sponsored"}
          </span>
        </div>
        {/* The chip sits where a Shot's SHOT chip sits, and where a post's ⋯
            sits — the one place in this layout a reader already looks to find
            out what kind of card they are on. */}
        <span className="flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-black tracking-wide text-muted">
          <Megaphone size={9} /> AD
        </span>
      </div>

      {/* Fixed height in EVERY branch — filled, unfilled, blocked, house.
          A slot that grows when the creative lands is a layout shift at the
          moment the reader is scrolling fastest, and one that collapses leaves
          the feed jumping under their thumb instead. Both cost the same to
          avoid: never change the height. */}
      <div
        ref={boxRef}
        className="mx-4 overflow-hidden rounded-2xl bg-elevated"
        style={{ height: AD_RESERVED_PX }}
      >
        {house ? (
          <HouseSponsoredCard seed={ad.index} />
        ) : armed ? (
          <AdSenseUnit personalised={personalised} onEmpty={handleEmpty} />
        ) : null}
      </div>

      <p className="px-4 pt-2 text-xs text-faint">
        {house ? "From Hypefy." : "Ads keep Hypefy free."}{" "}
        <Link href="/privacy#ads" className="underline">
          Why am I seeing this?
        </Link>
      </p>
    </article>
  );
}
