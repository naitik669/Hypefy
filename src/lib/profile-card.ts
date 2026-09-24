import { BANNERS } from "@/lib/profile";

/**
 * Profile card — the shareable view behind an expanded avatar.
 *
 * Layout and theme are stored on profiles (card_layout, card_theme) and
 * the links live in profile_links. Both are readable by anyone, because a
 * card that needs an account defeats the QR on it.
 */

export type CardLayout = "photo" | "framed" | "poster" | "pass" | "banner" | "centred" | "aligned";

/** In the order Edit card offers them; the first is the default. */
export const CARD_LAYOUTS: { id: CardLayout; label: string; hint: string }[] = [
  { id: "photo", label: "Photo", hint: "Photo melts into the top of the card" },
  { id: "framed", label: "Framed", hint: "Photo in a rounded frame, card around it" },
  { id: "poster", label: "Poster", hint: "Photo fills the card, details on glass" },
  { id: "pass", label: "Pass", hint: "A member pass with your QR as its stub" },
  { id: "banner", label: "Banner", hint: "Banner across the top, big squircle photo" },
  { id: "centred", label: "Centred", hint: "Avatar on top, everything stacked" },
  { id: "aligned", label: "Aligned", hint: "Avatar beside the name, text left" },
];

export const DEFAULT_LAYOUT: CardLayout = "photo";
export const DEFAULT_THEME = "lime-pulse";

/** Card themes reuse the profile banner gradients, so the two never drift. */
export const CARD_THEMES = BANNERS;

export function isCardLayout(v: unknown): v is CardLayout {
  return CARD_LAYOUTS.some((l) => l.id === v);
}

/** Hard cap, matching the profile_links_limit trigger in the database. */
export const MAX_LINKS = 8;

export type ProfileLink = {
  id: string;
  label: string;
  url: string;
  position: number;
};

/**
 * Where a scanned card lands. Not the apex: hypefy.chat is the marketing
 * site, and /u/ is open on the app host specifically so a shared profile
 * is readable without an invite code.
 */
export const APP_ORIGIN = "https://app.hypefy.chat";

export function profileUrl(username: string | null): string {
  return username ? `${APP_ORIGIN}/u/${username}` : APP_ORIGIN;
}

/**
 * Only http(s) survives. The database rejects anything else on write, but
 * rows predating that constraint — or a URL that slipped through a future
 * migration — must never reach an anchor's href as javascript: or data:.
 */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "https://example.com/shop?x=1" -> "example.com/shop" */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}
