/**
 * Cookie consent — what a reader has agreed to, and what we assume before
 * they have said.
 *
 * Three categories, and only two of them are a choice:
 *
 *   necessary    Always on. Signing in, the invite gate, remembering this very
 *                choice. The Service does not work without them, and consent
 *                law does not ask for consent to them.
 *   analytics    Google Analytics.
 *   ads          Google AdSense cookies, and personalised ads.
 *
 * Before a choice is made, the default depends on where the reader is:
 *
 *   EEA, UK, Switzerland, or unknown   everything off (opt-in). The law
 *                                      there requires consent first, and an
 *                                      unknown region is treated as the
 *                                      strict one rather than as permission.
 *   everywhere else                    on, with the banner offering the way
 *                                      out (opt-out).
 *
 * The choice is kept in a first-party cookie for six months, then asked
 * again. Bumping CONSENT_VERSION re-asks everyone — do that whenever the
 * cookie policy changes what a category covers.
 */

import { needsConsent } from "@/lib/ads";

export const CONSENT_VERSION = 1;
export const CONSENT_COOKIE = "hypefy_consent";
const MAX_AGE_DAYS = 182;

export type Consent = {
  analytics: boolean;
  ads: boolean;
  /** Set when the reader chose; absent means we are still on the default. */
  decidedAt?: string;
  version: number;
};

/** What applies before a choice: strict where the law is, open elsewhere. */
export function defaultConsent(country: string | null | undefined): Consent {
  const strict = needsConsent(country);
  return { analytics: !strict, ads: !strict, version: CONSENT_VERSION };
}

/** A stored choice we can still honour — the right shape and current version. */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.analytics !== "boolean" ||
      typeof v.ads !== "boolean" ||
      v.version !== CONSENT_VERSION
    ) {
      return null;
    }
    return {
      analytics: v.analytics,
      ads: v.ads,
      decidedAt: typeof v.decidedAt === "string" ? v.decidedAt : undefined,
      version: v.version,
    };
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

/** The stored choice, if there is a valid one. */
export function storedConsent(): Consent | null {
  return parseConsent(readCookie(CONSENT_COOKIE));
}

/** Whether to show the banner: nobody has chosen, or chose under an old policy. */
export function needsChoice(): boolean {
  return storedConsent() === null;
}

/** What is in force: the stored choice, or this region's default. */
export function currentConsent(country: string | null | undefined): Consent {
  return storedConsent() ?? defaultConsent(country);
}

/* ─── Change notification ───────────────────────────────────────────────
 *
 * Analytics and the ad slots both need to react the moment a choice is
 * made, not on the next page load — accepting should start measurement, and
 * rejecting should stop it now. A tiny in-page emitter rather than a context
 * provider, because the two listeners live in unrelated parts of the tree.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
/** Bumped on every change, so useSyncExternalStore has a cheap snapshot. */
let revision = 0;

export function subscribeConsent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function consentRevision(): number {
  return revision;
}

export function saveConsent(choice: { analytics: boolean; ads: boolean }) {
  const value: Consent = {
    analytics: choice.analytics,
    ads: choice.ads,
    decidedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  if (typeof document !== "undefined") {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}` +
      `; Max-Age=${MAX_AGE_DAYS * 86_400}; Path=/; SameSite=Lax${secure}`;
    // Withdrawing consent has to mean the cookies go, not only that no new
    // ones are set. Anything Google Analytics left behind is removed here.
    if (!choice.analytics) clearAnalyticsCookies();
  }
  revision += 1;
  for (const fn of listeners) fn();
}

/** Ask the banner to open its preferences — from Settings, or a legal page. */
export const OPEN_PREFERENCES_EVENT = "hypefy:consent:open";
export function openConsentPreferences() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
  }
}

/** Google Analytics' cookies: _ga, and _ga_<container> for each property. */
function clearAnalyticsCookies() {
  const names = document.cookie
    .split("; ")
    .map((p) => p.split("=")[0])
    .filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid");
  // GA sets them on the registrable domain, so clear both that and the host.
  const host = location.hostname;
  const parts = host.split(".");
  const root = parts.length > 2 ? parts.slice(-2).join(".") : host;
  for (const n of names) {
    for (const domain of ["", `; Domain=${host}`, `; Domain=.${root}`]) {
      document.cookie = `${n}=; Max-Age=0; Path=/${domain}`;
    }
  }
}

/**
 * The same choice in Google Consent Mode's vocabulary, for gtag.
 *
 * ad_user_data and ad_personalization are the two signals Consent Mode v2
 * added; Google treats their absence as a denial for EEA traffic, so they are
 * always sent explicitly.
 */
export function toGoogleConsent(c: Pick<Consent, "analytics" | "ads">) {
  const on = (b: boolean) => (b ? "granted" : "denied");
  return {
    analytics_storage: on(c.analytics),
    ad_storage: on(c.ads),
    ad_user_data: on(c.ads),
    ad_personalization: on(c.ads),
  } as const;
}
