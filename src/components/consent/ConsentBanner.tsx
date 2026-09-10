"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Cookie, X } from "lucide-react";
import { SettingToggle } from "@/components/settings/SettingToggle";
import {
  OPEN_PREFERENCES_EVENT,
  currentConsent,
  needsChoice,
  openConsentPreferences,
  saveConsent,
  subscribeConsent,
} from "@/lib/consent";

/**
 * The cookie banner, and the preferences it opens.
 *
 * A card at the bottom of the screen rather than a wall in front of it: the
 * page stays readable and usable underneath, including the cookie policy the
 * card links to. It is not dismissable by tapping away — closing without
 * choosing would leave the question unanswered — but "Reject" is a single
 * tap, the same size as "Accept", because refusing has to be exactly as easy
 * as agreeing. That is a legal requirement in the EEA and simply fair
 * everywhere else.
 *
 * It appears once, after mount: whether anyone has chosen lives in a cookie
 * the server does not read, and deciding during render would give the
 * server and the browser two different pages.
 */
export function ConsentBanner({ country }: { country: string | null }) {
  // "Has anyone chosen?" read from the cookie, re-read on every change. Hidden
  // on the server, which cannot see the cookie.
  const undecided = useSyncExternalStore(subscribeConsent, needsChoice, () => false);

  const [prefsOpen, setPrefsOpen] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, ads: false });

  // Settings and the cookie policy open the preferences from anywhere.
  useEffect(() => {
    const open = () => {
      const c = currentConsent(country);
      setDraft({ analytics: c.analytics, ads: c.ads });
      setPrefsOpen(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, open);
  }, [country]);

  function choose(analytics: boolean, ads: boolean) {
    saveConsent({ analytics, ads });
    setPrefsOpen(false);
  }

  if (!undecided && !prefsOpen) return null;

  return (
    <div
      className="fixed inset-x-0 z-[60] mx-auto w-full max-w-[480px] px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <section
        role="dialog"
        aria-labelledby="consent-title"
        className="animate-modal-pop rounded-[28px] border border-border bg-elevated/95 p-4 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[30%] bg-accent/15 text-accent">
            <Cookie size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="consent-title" className="text-[15px] font-extrabold leading-tight">
              {prefsOpen ? "Cookie preferences" : "Your call on cookies"}
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-muted">
              {prefsOpen
                ? "Essential cookies keep you signed in. The rest are up to you, and you can change them any time in Settings."
                : "Essential cookies keep Hypefy working. With your OK, we also use Google Analytics to see what's working, and Google ads to keep Hypefy free."}{" "}
              <Link href="/cookies" className="font-semibold text-foreground underline underline-offset-2">
                Cookie policy
              </Link>
            </p>
          </div>
          {/* Closing preferences you opened from Settings is fine — you have
              already chosen once. The first-time banner has no close: an
              unanswered question is not an answer. */}
          {prefsOpen && !undecided && (
            <button
              type="button"
              onClick={() => setPrefsOpen(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/5"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {prefsOpen ? (
          <>
            <div className="mt-3 flex flex-col rounded-2xl bg-surface/60 px-1">
              <div className="flex items-center gap-3 px-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Essential</p>
                  <p className="text-xs text-muted">Signing in, security, remembering this choice</p>
                </div>
                <span className="shrink-0 rounded-pill bg-accent/15 px-2.5 py-1 text-[11px] font-bold text-accent">
                  Always on
                </span>
              </div>
              <SettingToggle
                label="Analytics"
                sub="Google Analytics — which screens get used, so we know what to fix"
                checked={draft.analytics}
                onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
              />
              <SettingToggle
                label="Advertising"
                sub="Google ads in the feed. Off means you see Hypefy's own cards instead"
                checked={draft.ads}
                onChange={(v) => setDraft((d) => ({ ...d, ads: v }))}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => choose(draft.analytics, draft.ads)}
                className="h-11 rounded-2xl border border-border bg-surface text-sm font-bold"
              >
                Save choices
              </button>
              <button
                type="button"
                onClick={() => choose(true, true)}
                className="h-11 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink"
              >
                Accept all
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => choose(false, false)}
                className="h-11 rounded-2xl border border-border bg-surface text-sm font-bold"
              >
                Reject all
              </button>
              <button
                type="button"
                onClick={() => choose(true, true)}
                className="h-11 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink"
              >
                Accept all
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const c = currentConsent(country);
                setDraft({ analytics: c.analytics, ads: c.ads });
                setPrefsOpen(true);
              }}
              className="mt-2 w-full py-1.5 text-center text-xs font-semibold text-muted underline underline-offset-2"
            >
              Choose what to allow
            </button>
          </>
        )}
      </section>
    </div>
  );
}

/** Reopens the preferences — for Settings and the cookie policy. */
export function CookiePreferencesButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openConsentPreferences}
      className={className}
    >
      Cookie preferences
    </button>
  );
}
