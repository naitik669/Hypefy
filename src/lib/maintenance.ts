/**
 * "Back soon", for when Hypefy has to be taken down on purpose or the
 * database is not answering.
 *
 * Switched by an environment variable rather than a row in the database,
 * because the moment this is needed is the moment the database may be the
 * thing that is down. Set MAINTENANCE_MODE=on in Vercel and redeploy; unset
 * it and redeploy to come back.
 *
 * While it is on, every page answers with the maintenance screen and every
 * API route with a 503, before anything touches Supabase. The pages people
 * are owed regardless stay up: the legal pages, and the two Google Play
 * links to (account deletion, child safety).
 */

/** Paths that stay reachable while Hypefy is down. */
const STAYS_UP = [
  "/maintenance",
  "/privacy",
  "/terms",
  "/guidelines",
  "/cookies",
  "/delete-account",
  "/child-safety",
  // The Android app reads this to decide whether to reload itself.
  "/api/version",
  // Payments and scheduled jobs carry their own retries; refusing them here
  // would only lose them. They fail on their own if the database is down.
  "/api/billing/webhook",
];

const STATIC = /^\/(_next\/|icons\/)|\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|js|css|html)$/;

export function maintenanceOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.MAINTENANCE_MODE === "on";
}

export type MaintenanceAnswer = "pass" | "page" | "api";

/** What a request gets while maintenance is on. */
export function maintenanceAnswer(pathname: string): MaintenanceAnswer {
  if (STAYS_UP.includes(pathname) || STATIC.test(pathname)) return "pass";
  return pathname.startsWith("/api/") ? "api" : "page";
}
