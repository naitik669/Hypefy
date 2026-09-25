"use client";

import { useState } from "react";
import Link from "next/link";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { BottomSheet } from "@/components/ui/BottomSheet";

/**
 * The badge on a profile, tappable. It says what the star means — someone
 * who pays for Verified or Premium — and offers one of your own.
 */
export function VerifiedBadgeButton({ name, isOwn }: { name: string; isOwn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About the Verified badge"
        className="-m-1 flex shrink-0 items-center p-1"
      >
        <VerifiedStar className="h-4 w-4" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col items-center px-2 pb-4 pt-2 text-center">
          <VerifiedStar className="h-14 w-14 drop-shadow-[0_0_18px_rgba(77,141,255,0.45)]" />
          <p className="mt-3 text-lg font-extrabold">Verified</p>
          <p className="mt-1 max-w-[32ch] text-sm text-muted">
            {isOwn
              ? "Your badge shows next to your name everywhere on Hypefy."
              : `${name} is a Hypefy Verified member. The blue star comes with Verified and with Premium.`}
          </p>
          <Link
            href={isOwn ? "/settings/subscription" : "/premium"}
            onClick={() => setOpen(false)}
            className="mt-5 w-full rounded-2xl bg-accent py-3.5 text-sm font-extrabold text-accent-ink"
          >
            {isOwn ? "Manage your plan" : "Get yours"}
          </Link>
        </div>
      </BottomSheet>
    </>
  );
}
