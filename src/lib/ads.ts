/**
 * Whether, and how, to fill an ad slot.
 *
 * Off unless configured, the same shape as the invite gate: there is no "on"
 * switch anywhere in here, only the presence of configuration. A deploy that
 * knows nothing about ads shows none, and that is the default for local, CI
 * and preview alike.
 *
 * Three separate reasons this can return "off" or fall back to a house card,
 * and they are genuinely different problems:
 *
 *   1. The native shell. capacitor.config.ts points the Play Store app at
 *      https://app.hypefy.chat, so the Android app is a WebView loading this
 *      exact bundle. AdSense is the browser product and its policy does not
 *      cover an app WebView — that is AdMob's territory, and AdMob needs a
 *      native SDK we have not built. So the app gets Hypefy's own card.
 *
 *   2. Consent. There is no CMP in this app and no cookie banner. Serving to
 *      an EEA/UK reader without a certified consent flow is not something a
 *      flag can paper over, so those readers get the house card too, and an
 *      unknown region is treated as EEA rather than as permission.
 *
 *   3. Age. The app's only threshold is 13 (age_ok, migration 0053) and
 *      nothing computes 18. Anyone we cannot positively confirm is an adult —
 *      including every OAuth account with no date of birth — still sees ads,
 *      but non-personalised ones.
 */

/** What should actually fill a slot. */
export type AdFill = "off" | "house" | "adsense";

export const AD_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
export const AD_SLOT_FEED = process.env.NEXT_PUBLIC_ADSENSE_FEED_SLOT ?? "";
export const AD_LAYOUT_KEY = process.env.NEXT_PUBLIC_ADSENSE_FEED_LAYOUT_KEY ?? "";

/**
 * The height an ad card's body occupies from first paint, in every branch —
 * filled, unfilled, blocked, or house.
 *
 * Derived rather than picked: on a 393px viewport the media box is 361px wide
 * inside `mx-4`, and an in-feed unit at roughly 1.91:1 is ~189px of image, plus
 * a headline, a line of body text and a call to action. The exact number
 * matters less than the fact that it never changes once the card is on screen —
 * a slot that grows when the creative arrives is a layout shift at the moment
 * the reader is scrolling fastest.
 */
export const AD_RESERVED_PX = 320;

/** Regions with no lawful path to serving until a CMP exists. */
const CONSENT_REQUIRED = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA beyond the EU, plus the UK and Switzerland.
  "IS", "LI", "NO", "GB", "CH",
]);

/**
 * Does this reader's region require consent we cannot currently collect?
 *
 * An absent or unrecognised country is a yes. The country arrives from an edge
 * header, and a header that failed to arrive is not evidence of anything —
 * reading it as "not in Europe" would make a misconfiguration serve ads into
 * exactly the jurisdiction that must not get them.
 */
export function needsConsent(country: string | null | undefined): boolean {
  if (!country) return true;
  return CONSENT_REQUIRED.has(country.toUpperCase());
}

/** The configured mode, before any per-reader gate. */
export function adMode(): AdFill {
  const m = process.env.NEXT_PUBLIC_ADS_MODE;
  if (m === "house") return "house";
  // A half-configured "adsense" is a misconfiguration, not an instruction:
  // pushing to an <ins> with no client id produces a console error and an
  // empty box, so fall back rather than trying.
  if (m === "adsense" && AD_CLIENT && AD_SLOT_FEED && AD_LAYOUT_KEY) {
    return "adsense";
  }
  return "off";
}

export type AdContext = {
  /** The reader's country, from the edge. Null when unknown. */
  country: string | null;
  /**
   * Whether we are inside the native shell. Callers pass `isNative()` from
   * `@/lib/native`, and must do so AFTER mount — it answers `false` during
   * SSR because Capacitor is absent on the server, which is exactly the wrong
   * answer to act on.
   *
   * Not imported here, so this module stays importable from a server
   * component: that is where the region and the age both come from.
   */
  native: boolean;
};

/**
 * What fills a slot for this reader.
 *
 * Note that "house" is a real answer, not a failure: a native or EEA reader
 * still gets a card, it is just ours. Returning "off" would leave a hole in
 * the middle of the feed where the placement rules put a card.
 */
export function adFill(ctx: AdContext): AdFill {
  const mode = adMode();
  if (mode === "off") return "off";
  if (mode === "house") return "house";
  if (ctx.native) return "house";
  if (needsConsent(ctx.country)) return "house";
  return "adsense";
}

/** Should slots be placed at all? House still counts — it fills a card. */
export function adsEnabled(ctx: AdContext): boolean {
  return adFill(ctx) !== "off";
}

/**
 * Personalised ads only for a confirmed adult.
 *
 * `isAdult` must be computed on the server from `profiles.date_of_birth`: a
 * client clock is adjustable, and this is the input to a compliance decision.
 * A null date of birth is a no — not "probably fine".
 */
export function personalised(isAdult: boolean): boolean {
  return isAdult === true;
}

/**
 * Ask Google for test creatives instead of real ones.
 *
 * This is AdSense's own switch (data-adtest="on"), not a mock of ours: the
 * script loads, the unit is requested and filled, and the whole path runs
 * exactly as it will in production — but the impression is not counted and
 * not paid, so it cannot generate invalid traffic. It still needs a real
 * publisher id; there is no way to exercise the served path without one.
 *
 * This is what makes it safe to run `adsense` mode outside Production, and
 * the only thing that does.
 */
export function adTest(): boolean {
  return process.env.NEXT_PUBLIC_ADS_TEST === "1";
}

/** How many ads one browsing session may show, however far it scrolls. */
export const AD_SESSION_BUDGET = 8;

const BUDGET_KEY = "hypefy_ads_shown";

/**
 * Ads already shown this session, from sessionStorage.
 *
 * Session rather than local storage on purpose: the cap is about not wearing
 * out one sitting, and a reader who comes back tomorrow is a new sitting.
 * Follows loadSeen/saveSeen in feed-seen.ts — same idiom, different lifetime.
 */
export function adsShown(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(BUDGET_KEY)) || 0;
  } catch {
    // Private mode, or storage blocked. Reporting zero means the cap stops
    // biting, which is the right way round: a reader who cannot be counted
    // should not be cut off from a feed that has already reserved the slots.
    return 0;
  }
}

/** Spend one. Called on IMPRESSION, never on placement. */
export function noteAdShown() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BUDGET_KEY, String(adsShown() + 1));
  } catch {
    /* non-fatal */
  }
}

/** How many more this session may place. Never negative. */
export function adBudgetLeft(): number {
  return Math.max(0, AD_SESSION_BUDGET - adsShown());
}
