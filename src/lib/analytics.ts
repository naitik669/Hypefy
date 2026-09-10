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
 *      so it runs only when the reader's analytics consent is on — their own
 *      choice from the cookie banner, or, before they have chosen, their
 *      region's default (see lib/consent.ts: off in the EEA, UK and
 *      Switzerland, on elsewhere). This is Consent Mode's "basic" setup:
 *      without consent, Google's script is never loaded at all, rather than
 *      loaded and told to hold back.
 *
 *   3. **NOT the native shell.** This is the one that differs from ads.
 *      AdSense is barred from an app WebView by policy; analytics is not, and
 *      the Android app loads this exact bundle, so measuring it here is how
 *      app traffic gets counted at all without a separate mobile SDK. It does
 *      mean the Play data-safety declaration has to say analytics data is
 *      collected.
 */

/**
 * Hypefy's GA4 measurement id. In the code, and deliberately not overridable
 * from the environment.
 *
 * It used to read NEXT_PUBLIC_GA_ID first, and Production's value turned out
 * to be a different property (G-9BHYTW0V95) — so the site measured into one
 * property while the one being set up saw nothing, and the setting survived
 * an attempt to change it. One id, in one place, that a review can see.
 *
 * A measurement id is not a secret: Google's own snippet prints it into every
 * page. What keeps this safe is MEASURED_HOSTS below — off the live domains
 * nothing is sent, so a local checkout, a preview deploy or a fork measures
 * nothing whatever this says. To change properties, change this line.
 */
export const GA_ID = "G-EQD7SK0DGZ";

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
  /** Whether analytics consent is in force — chosen, or the regional default. */
  analytics: boolean;
};

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

  // On the live site there is a reader, and only their consent decides. The
  // debug switch does not speak for them.
  return ctx.analytics;
}
