"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronLeft, ChevronUp, Megaphone } from "lucide-react";
import { AD_SLOT_SHOTS, type AdFill } from "@/lib/ads";
import { AdImpression } from "@/components/feed/AdImpression";
import { AdSenseUnit } from "@/components/feed/AdSenseUnit";
import { HouseSponsoredCard } from "@/components/feed/HouseSponsoredCard";

/**
 * An ad in the Shots reel.
 *
 * Every card in the reel is the whole screen, so this is too — but the ad
 * itself deliberately is not. It sits in a box with open space above and
 * below, and that space is doing a job.
 *
 * The reel moves by touch events on the stage behind every card. A touch that
 * starts inside the ad's iframe never reaches that stage: it belongs to a
 * different document, and it does not bubble out. An ad covering the screen
 * would therefore be a screen you could not swipe away from — you could only
 * tap it, which is the one thing nobody should be pushed into. The margins are
 * where the swipe lives, and the prompt at the bottom says so.
 *
 * Covering the creative with a transparent layer to catch the swipe instead
 * would make the ad unclickable, and placing ads under overlays is against
 * AdSense policy. The margins are the honest version.
 *
 * The chrome copies a reel's — same back button in the same place, same
 * chip treatment as a SHOT label — so the page is recognisably part of the
 * reel, and just as recognisably not a Shot.
 */

/** Tall enough for a display creative, short enough to leave room to swipe. */
const BOX_HEIGHT = "min(420px, 58%)";

export function ShotAdCard({
  ad,
  fill,
  personalised,
  isActive,
  near,
  onBack,
  onSeen,
}: {
  ad: { id: string; index: number };
  fill: AdFill;
  personalised: boolean;
  isActive: boolean;
  /** Within one card of the one on screen. */
  near: boolean;
  onBack: () => void;
  onSeen: (adId: string) => void;
}) {
  const [empty, setEmpty] = useState(false);
  const handleEmpty = useCallback(() => setEmpty(true), []);

  // Every card in the reel is mounted at once, stacked off-screen. Mounting an
  // ad unit for each would request an ad for every slot the moment the page
  // opens — most of them for cards nobody reaches, which is wasted inventory
  // and the kind of viewability that gets a site's ads throttled. So a unit is
  // requested when its card comes within one swipe, the same window the reel
  // uses to preload video, and then kept: unmounting it on the way past would
  // request it again coming back.
  const [armed, setArmed] = useState(near);
  // Latched during render rather than in an effect: an effect would render
  // the card once unarmed and then again armed, for no reason but order.
  if (near && !armed) setArmed(true);

  const house = fill !== "adsense" || empty;
  // A dedicated Display unit when there is one; otherwise the feed's In-feed
  // unit, which works but renders at card height rather than filling the box.
  const slot = AD_SLOT_SHOTS || undefined;
  const layoutKey = AD_SLOT_SHOTS ? "" : undefined;

  return (
    <div
      className="relative flex h-full w-full flex-col bg-black"
      data-ad-card
      data-ad-fill={house ? "house" : "adsense"}
    >
      {/* Counts only while on screen, and only after a real dwell — the
          sentinel exists while this card is the active one and no longer. */}
      {isActive && <AdImpression adId={ad.id} onSeen={onSeen} />}

      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="absolute left-3 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
      >
        <ChevronLeft size={22} />
      </button>

      <div className="flex items-center justify-center gap-2 pt-5">
        <span className="text-sm font-semibold text-white/90">
          {house ? "From Hypefy" : "Sponsored"}
        </span>
        <span className="flex items-center gap-1 rounded-pill bg-white/10 px-2 py-0.5 text-[10px] font-black tracking-wide text-white/70">
          <Megaphone size={9} /> AD
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
        <div
          className="flex w-full items-center justify-center overflow-hidden rounded-2xl bg-elevated"
          style={{ height: BOX_HEIGHT }}
        >
          {house ? (
            <HouseSponsoredCard seed={ad.index} />
          ) : armed ? (
            <AdSenseUnit
              personalised={personalised}
              onEmpty={handleEmpty}
              slot={slot}
              layoutKey={layoutKey}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 pb-7 text-white/60">
        <ChevronUp size={20} className={isActive ? "animate-bounce" : ""} />
        <span className="text-xs font-semibold">Swipe up for more Shots</span>
        <Link
          href="/privacy#ads"
          prefetch={false}
          className="mt-1 text-[11px] text-white/40 underline"
        >
          Why am I seeing this?
        </Link>
      </div>
    </div>
  );
}
