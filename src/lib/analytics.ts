import { needsConsent } from "@/lib/ads";

/**
 * Google Analytics 4 — whether it runs, and where its data lands.
 *
 * Off unless configured, like everything else here. Three gates, and they are
 * not the same three as ads, which is worth saying because the reasons differ:
 *
 *   1. **Origin.** Real traffic is only real traffic. A developer reloading
 *      /home forty times is not forty sessions, and once that is in the
 *      reports it cannot be taken out. So localhost and preview deploys send
 *      nothing — unless explicitly put in debug mode, which routes to GA's
 *      DebugView instead of the reports.
 *
 *   2. **Consent.** GA sets cookies and is analytics, not strictly necessary,
 *      so an EEA/UK reader needs a consent choice this app cannot yet offer.
 *      Same answer as ads: not until there is a CMP. Unknown region counts as
 *      EEA.
 *
 *   3. **NOT the native shell.** This is the one that differs from ads.
 *      AdSense is barred from an app WebView by policy; analytics is not, and
 *      the Android app loads this exact bundle, so measuring it here is how
 *      app traffic gets counted at all without a separate mobile SDK. It does
 *      mean the Play data-safety declaration has to say analytics data is
 *      collected.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

/**
 * Origins whose traffic belongs in the reports.
 *
 * The same list ads use, for a different reason: there it protects an ad
 * account from invalid traffic, here it protects a year of analytics from
 * being half development noise.
 */
const MEASURED_HOSTS = new Set([
  "app.hypefy.chat",
  "hypefy.chat",
  "www.hypefy.chat",
]);

/** Send from anywhere, but tag it so it lands in DebugView, not the reports. */
export function gaDebug(): boolean {
  return process.env.NEXT_PUBLIC_GA_DEBUG === "1";
}

export type GaContext = {
  /** The reader's country, resolved server-side. Null means unknown. */
  country: string | null;
};

export function needsGaConsent(country: string | null | undefined): boolean {
  // Delegating rather than keeping a second copy of the country list: two
  // lists drift, and the day they disagree is the day one of them is wrong
  // about a jurisdiction.
  return needsConsent(country);
}

export function gaEnabled(ctx: GaContext): boolean {
  if (!GA_ID) return false;
  if (typeof window === "undefined") return false;

  // Off the live site there is no reader — only whoever is running the dev
  // server — so consent is not the question and the region header does not
  // exist to answer it with. The question is whether someone deliberately
  // asked to measure, and debug hits land in DebugView rather than the
  // reports. Checking consent first would make this branch unreachable:
  // localhost has no country header, null reads as EEA, and an installation
  // could never be verified anywhere.
  if (!MEASURED_HOSTS.has(window.location.hostname)) return gaDebug();

  // On the live site there is a reader, and the debug switch does not speak
  // for them.
  return !needsGaConsent(ctx.country);
}
