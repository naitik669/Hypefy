"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { createClient } from "@/lib/supabase/client";

/**
 * The badge, beside a name, tappable.
 *
 * A profile opens a whole sheet about it, because that is a considered visit.
 * Everywhere else the badge is inline — in a feed header, a comment row, a
 * chat title — so it gets a pill that points at the badge you touched and
 * gets out of the way. A popup with no caret would be a toast, and a toast
 * cannot tell you which of the four badges on screen it is answering.
 *
 * The wording is the quiet kind on purpose. It appears beside every name in
 * the app, so it has to survive being seen ten times a screen: no urgency, no
 * exclamation, nothing that sounds like it is trying. And it stops selling —
 * see OFFER_PER_DAY.
 */

/* ── Who is looking ──────────────────────────────────────────────────────
 * Fetched once per page load and shared by every badge on it. A hundred
 * badges in a feed must not be a hundred queries.
 */
type Viewer = { id: string | null; premium: boolean };
let viewerOnce: Promise<Viewer> | null = null;

function getViewer(): Promise<Viewer> {
  viewerOnce ??= (async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id ?? null;
    if (!id) return { id: null, premium: false };
    const { data: me } = await supabase
      .from("profiles")
      .select("is_premium, is_verified")
      .eq("id", id)
      .maybeSingle();
    return { id, premium: !!(me?.is_premium || me?.is_verified) };
  })();
  return viewerOnce;
}

/* ── How often it is allowed to sell ─────────────────────────────────────
 * However well it is worded, this is a Premium prompt attached to something
 * that appears beside every name in the app. Twice a day, never twice in a
 * session, then it goes back to being a plain statement of fact. The badge
 * stays tappable forever; only the selling stops.
 */
const OFFER_PER_DAY = 2;
const DAY_KEY = "hypefy.verified.offer";
const SESSION_KEY = "hypefy.verified.offer.session";

function offerAllowed(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    const today = new Date().toDateString();
    const raw = localStorage.getItem(DAY_KEY);
    const seen = raw ? (JSON.parse(raw) as { day?: string; n?: number }) : null;
    return seen?.day !== today || (seen.n ?? 0) < OFFER_PER_DAY;
  } catch {
    // Private windows and blocked site data throw. Erring toward showing it
    // is the gentler failure: the cap is a courtesy, not a guarantee.
    return true;
  }
}

function noteOfferShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
    const today = new Date().toDateString();
    const raw = localStorage.getItem(DAY_KEY);
    const seen = raw ? (JSON.parse(raw) as { day?: string; n?: number }) : null;
    const n = seen?.day === today ? (seen.n ?? 0) + 1 : 1;
    localStorage.setItem(DAY_KEY, JSON.stringify({ day: today, n }));
  } catch {
    /* nothing to record, nothing to fix */
  }
}

/* ── Only one open at a time ─────────────────────────────────────────── */
let closeOther: (() => void) | null = null;

/* ── Where the pill goes ─────────────────────────────────────────────── */
const GAP = 9;
const EDGE = 10;
/** Where the caret sits from the pill's left edge when nothing is clamped. */
const CARET = 18;
/**
 * The caret is w-2.5 and is positioned against the pill's padding box, so its
 * visible centre lands half its own width plus the 1px border to the right of
 * whatever `left` it is given. Subtracting that is what actually puts the
 * point on the badge.
 */
const CARET_CENTRE = 10 / 2 + 1;

type Spot = { left: number; top: number; above: boolean; caret: number };

/**
 * The pill is measured by its layout box, not by getBoundingClientRect: the
 * pop animation starts at scale(0.7), and a rect is the TRANSFORMED box. The
 * first version measured a pill 70% of its real size, so it sat ten pixels
 * too low and the caret missed the badge.
 */
type Size = { width: number; height: number };

function place(badge: DOMRect, pill: Size): Spot {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Below by default; above when there is no room, which is what happens in
  // a chat title bar and at the bottom of a comment list.
  const above = badge.bottom + GAP + pill.height > vh - EDGE && badge.top - GAP - pill.height > EDGE;
  const top = above ? badge.top - GAP - pill.height : badge.bottom + GAP;

  // The caret stays on the badge even once the pill has been clamped, which
  // is the whole reason a caret is there.
  const wanted = badge.left + badge.width / 2 - CARET;
  const left = Math.min(Math.max(wanted, EDGE), Math.max(EDGE, vw - pill.width - EDGE));
  const caret = Math.min(
    Math.max(badge.left + badge.width / 2 - left - CARET_CENTRE, 10),
    Math.max(10, pill.width - 22),
  );
  return { left, top, above, caret };
}

export function VerifiedBadge({
  className = "",
  userId,
}: {
  className?: string;
  /** Whose badge this is, so your own says "Your badge" rather than selling. */
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [selling, setSelling] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const badgeRef = useRef<HTMLButtonElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSpot(null);
    if (closeOther) closeOther = null;
  }, []);

  function toggle() {
    if (open) {
      close();
      return;
    }
    closeOther?.();
    closeOther = close;
    const allowed = offerAllowed();
    setSelling(allowed);
    if (allowed) noteOfferShown();
    setOpen(true);
    void getViewer().then(setViewer);
  }

  // Measured after the pill is in the DOM, because where it goes depends on
  // how big it turned out to be.
  useEffect(() => {
    if (!open) return;
    const badge = badgeRef.current;
    const pill = pillRef.current;
    if (!badge || !pill) return;
    setSpot(place(badge.getBoundingClientRect(), { width: pill.offsetWidth, height: pill.offsetHeight }));
  }, [open, viewer, selling]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Scrolling away from the badge should take the pill with it rather than
    // leaving it pointing at nothing.
    const onMove = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close]);

  const mine = !!(viewer?.id && userId && viewer.id === userId);
  const label = mine ? "Your badge" : "Verified Badge";
  // No offer to someone who already pays, and none once it has been asked
  // twice — at that point it has been asked and answered, and it is a fact.
  const cta = mine
    ? { text: "Manage", href: "/settings/subscription" }
    : viewer?.premium
      ? { text: "Same as you", href: null }
      : selling && viewer?.id
        ? { text: "Want one?", href: "/premium" }
        : null;

  return (
    <>
      <button
        ref={badgeRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggle();
        }}
        aria-label="About the Verified badge"
        aria-expanded={open}
        className="-m-1 flex shrink-0 items-center p-1"
      >
        <VerifiedStar className={className} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* A tap anywhere puts it away. Transparent, so nothing dims. */}
            <div
              className="fixed inset-0 z-[70]"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
            />
            <div
              ref={pillRef}
              role="dialog"
              aria-label="Verified badge"
              className="animate-[pop-menu_0.24s_cubic-bezier(0.2,1.25,0.4,1)_both] fixed z-[71] whitespace-nowrap rounded-xl border border-border bg-elevated shadow-[0_10px_28px_rgba(0,0,0,0.55)]"
              style={{
                left: spot?.left ?? -9999,
                top: spot?.top ?? -9999,
                // Hidden for the frame before it has been measured, so it
                // never flashes in the top-left corner first.
                visibility: spot ? "visible" : "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span
                aria-hidden
                className="absolute h-2.5 w-2.5 rotate-45 border-border bg-elevated"
                style={
                  spot?.above
                    ? { bottom: -6, left: spot.caret, borderRightWidth: 1, borderBottomWidth: 1 }
                    : { top: -6, left: spot?.caret ?? 18, borderLeftWidth: 1, borderTopWidth: 1 }
                }
              />
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-[11.5px] font-extrabold">{label}</span>
                {cta && (
                  <>
                    <span aria-hidden className="h-3 w-px bg-border" />
                    {cta.href ? (
                      <Link
                        href={cta.href}
                        onClick={close}
                        className="text-[11.5px] font-extrabold text-verified"
                      >
                        {cta.text}
                      </Link>
                    ) : (
                      <span className="text-[11.5px] font-bold text-muted">{cta.text}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
