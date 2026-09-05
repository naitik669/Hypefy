"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { FloatingMenu } from "@/components/ui/FloatingMenu";
import { haptics } from "@/lib/haptics";

export type FeedTab = "foryou" | "following" | "favourite" | "hypers";

/**
 * The tabs you can switch to.
 *
 * "favourite" was missing from this list while being fully implemented
 * everywhere else — the FeedTab type below, FeedList's query, and its own
 * "No Favourites yet" empty state. And because useFeedTab validates the URL
 * param against THIS array, even typing ?feed=favourite fell back to For You.
 *
 * So the feature was complete and reachable from nowhere. Zero of seventeen
 * accounts have ever marked a favourite, which is not a verdict on the idea:
 * there was no screen in the app that showed the result.
 */
const OPTIONS: { value: FeedTab; label: string }[] = [
  { value: "foryou", label: "For You" },
  { value: "following", label: "Following" },
  { value: "favourite", label: "Favourites" },
  { value: "hypers", label: "Hypers" },
];

/** Reads the active feed tab from the URL (?feed=), defaulting to "foryou". */
export function useFeedTab(): FeedTab {
  const params = useSearchParams();
  const raw = params.get("feed");
  return (OPTIONS.some((o) => o.value === raw) ? raw : "foryou") as FeedTab;
}

/**
 * Wordmark + tiny chevron that opens a small anchored menu for switching
 * the home feed's tab. Selecting an option updates the `?feed=` URL param;
 * FeedList reads the same param via useFeedTab so the two stay in sync
 * without any shared client state.
 */
export function FeedTabDropdown() {
  const router = useRouter();
  const active = useFeedTab();
  const [open, setOpen] = useState(false);

  function select(tab: FeedTab) {
    haptics.tap();
    setOpen(false);
    router.replace(tab === "foryou" ? "/home" : `/home?feed=${tab}`, { scroll: false });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch feed"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full px-1.5 py-1 transition-colors active:scale-95"
      >
        <span className="text-xl font-extrabold tracking-tight">
          {active === "foryou" ? (
            <>
              Hypefy<span className="text-accent">.</span>
            </>
          ) : (
            OPTIONS.find((o) => o.value === active)?.label
          )}
        </span>
        {/* The chevron this component's own docstring has always claimed and
            never rendered. Without it the wordmark looked like a title, so
            nothing anywhere in the app suggested the feed had tabs — which is
            the likeliest reason Hypers sits at one user out of seventeen.

            The label also becomes the active tab's name once you leave For
            You, so the header answers "which feed am I looking at?" instead
            of showing the same word on all four. */}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        className="absolute left-0 top-full mt-2 w-48"
        origin="top-left"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="menuitem"
            onClick={() => select(o.value)}
            className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5 ${
              active === o.value ? "font-bold text-foreground" : "text-muted"
            }`}
          >
            {o.label}
            {active === o.value && <Check size={15} className="text-accent" />}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}
