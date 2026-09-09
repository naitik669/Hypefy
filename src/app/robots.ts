import type { MetadataRoute } from "next";

/**
 * What a crawler may read.
 *
 * There was no robots.txt at all before this, which is not the same as "allow
 * everything": it left Google to guess, with no sitemap to find and no signal
 * about which of these routes are content and which are plumbing. For an app
 * that is mostly plumbing, that guess goes badly.
 *
 * The allow-list is short on purpose. Three kinds of page here are worth
 * indexing — a profile, a post, a shot — plus the legal pages, which have to
 * be publicly readable anyway. Everything else is either a signed-in surface
 * that renders nothing useful to a stranger, an auth screen, or an endpoint.
 *
 * Disallow is not a privacy control. It asks well-behaved crawlers not to
 * fetch; it does not stop anyone reading a URL they already have. The real
 * boundary is still RLS, and a private profile is excluded from the sitemap
 * because it is private, not because of anything written here.
 */

const BASE = "https://app.hypefy.chat";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Auth and account recovery. Nothing to index, and a crawler
          // following these produces a lot of pointless 302s.
          "/signin",
          "/signup",
          "/check-email",
          "/reset-password",
          "/verify-2fa",
          "/verify-2step",
          "/gate",
          "/age-check",
          "/setup-profile",
          "/onboarding/follow",

          // Signed-in surfaces. Every one of these is empty or a redirect for
          // a visitor with no session, so indexing them would fill search
          // results with pages that say nothing.
          "/home",
          "/messages",
          "/notifications",
          "/settings",
          "/create",
          "/saved",
          "/favourites",
          "/collections",
          "/requests",
          "/hypers",
          "/calls",
          "/admin",

          // Endpoints and machinery.
          "/api/",
          "/auth/",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
