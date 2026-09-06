"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  function select(tab: FeedTab) {
    haptics.tap();
    setOpen(false);
    router.replace(tab === "foryou" ? "/home" : `/home?feed=${tab}`, { scroll: false });
  }

  /**
   * Toggle on pointerdown, not click.
   *
   * While the menu is open its click-catcher covers the whole viewport,
   * including this button, so the button never receives a pointerdown — the
   * catcher does, and closes. Tapping the wordmark again therefore closes and
   * cannot re-open. With onClick the behaviour was browser-dependent: the
   * pointerdown target (the catcher) is detached before pointerup, and where
   * the resulting click lands is not something to rely on.
   */
  function toggle() {
    if (open) return; // the catcher owns closing
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor({ left: r.left, top: r.bottom + 8 });
    setOpen(true);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onPointerDown={toggle}
        aria-label="Switch feed"
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative flex items-center rounded-full px-1.5 py-1 transition-colors active:scale-95"
      >
        <span className="relative text-xl font-extrabold tracking-tight">
          {active === "foryou" ? (
            <>
              Hypefy
              {/* The accent dot hangs off the right instead of sitting in the
                  flow. In the flow it added ~8px to the wordmark's measured
                  width, so centring the whole string left the WORD about 4px
                  left of centre — the bit that still looked crooked after the
                  chevron was taken out of the flow. */}
              <span className="absolute left-full top-0 text-accent" aria-hidden>
                .
              </span>
            </>
          ) : (
            OPTIONS.find((o) => o.value === active)?.label
          )}
        </span>
        {/* Absolutely positioned, so it is out of the flow entirely and the
            wordmark is what gets centred by the top bar. In the flow it took
            its own width plus a gap, which pushed "Hypefy." left of centre by
            about half that — the reason the title never looked quite straight.

            Hidden until the menu is open, at the cost of the discoverability
            it was added for: the label still changes to the active tab's name
            once you leave For You, so the header answers "which feed am I
            looking at?" even when the chevron is not showing. */}
        <ChevronDown
          size={16}
          className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 text-muted transition-all duration-200 ${
            // Clear the accent dot, which now hangs past the button's edge.
            active === "foryou" ? "ml-2.5" : "ml-1"
          } ${open ? "rotate-180 opacity-100" : "opacity-0"}`}
          aria-hidden
        />
      </button>

      {/* Portalled to <body> on purpose.
          FloatingMenu's click-catcher is `fixed inset-0`, but the top bar has
          backdrop-blur-xl, and a backdrop-filter creates a containing block for
          fixed-position descendants. Rendered in place, the "full-screen"
          catcher was clipped to the 56px header — measured at 548x55 in a
          563x419 viewport — so tapping anywhere below the bar could not close
          the menu. Both the catcher and the menu move out together, so their
          z-order relative to each other is unchanged. */}
      {open &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <FloatingMenu
            open
            onClose={() => setOpen(false)}
            className="fixed w-48"
            style={{ left: anchor.left, top: anchor.top }}
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
          </FloatingMenu>,
          document.body,
        )}
    </div>
  );
}
