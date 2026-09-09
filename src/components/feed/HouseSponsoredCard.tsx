"use client";

import Link from "next/link";
import { Zap, Users, Sparkles } from "lucide-react";

/**
 * What goes in an ad slot when Google does not.
 *
 * The slot fills this in far more cases than it fills a real ad: inside the
 * Android app, for every EEA reader, behind an ad blocker, when AdSense has
 * nothing to serve, and on any deploy where ads are in house mode. So this is
 * not a fallback in the apologetic sense — for a long while it is the card.
 *
 * It is drawn, not photographed. A local image would be one more asset to
 * ship and to size, and a slot whose entire job is to be exactly as tall as
 * its neighbour is easier to get right with a box we control completely.
 *
 * No third-party script, no iframe, no network request. That is what makes it
 * possible to test the whole ad path — placement, spacing, impressions,
 * capping, layout stability — before a Google account exists at all.
 */

type Promo = {
  key: string;
  href: string;
  icon: typeof Zap;
  eyebrow: string;
  headline: string;
  body: string;
  cta: string;
};

const PROMOS: Promo[] = [
  {
    key: "shots",
    href: "/shots",
    icon: Zap,
    eyebrow: "Shots",
    headline: "Vertical video, one thumb",
    body: "Short clips from people you already follow. Swipe and they keep coming.",
    cta: "Open Shots",
  },
  {
    key: "hypers",
    href: "/discover",
    icon: Users,
    eyebrow: "Discover",
    headline: "Find your people",
    body: "The feed gets better the moment you follow a few more of them.",
    cta: "Browse Discover",
  },
  {
    key: "showcase",
    href: "/showcase",
    icon: Sparkles,
    eyebrow: "Showcase",
    headline: "Make a board of your own",
    body: "Collect your shows, shots and memories into something worth opening.",
    cta: "Build a Showcase",
  },
];

export function HouseSponsoredCard({ seed }: { seed: number }) {
  // Deterministic from the slot index, so a re-render never swaps the promo
  // out from under a reader mid-scroll.
  const promo = PROMOS[Math.abs(seed) % PROMOS.length];
  const Icon = promo.icon;

  return (
    <Link
      href={promo.href}
      prefetch={false}
      className="flex h-full w-full flex-col justify-center gap-2 bg-elevated px-5 py-6 text-left transition-transform active:scale-[0.99]"
    >
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-accent">
        <Icon size={11} /> {promo.eyebrow}
      </span>
      <span className="text-lg font-bold leading-tight">{promo.headline}</span>
      <span className="text-sm leading-snug text-muted">{promo.body}</span>
      <span className="mt-1 w-fit rounded-pill bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink">
        {promo.cta}
      </span>
    </Link>
  );
}
