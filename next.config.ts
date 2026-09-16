import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Which build the page's code came from, so an open app can notice a newer
  // release and reload into it (src/lib/app-version.ts).
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
  experimental: {
    // Keep a page you just left for 30s, so going back to it — Home, then
    // Messages, then Home again — is instant instead of a fresh trip to the
    // server each time. (Next 15 made this 0s, which is what made switching
    // tabs feel like loading a new website.) Pages that must be current catch
    // themselves up: the inbox refreshes when it was drawn more than a few
    // seconds ago, and a chat fetches anything newer as it reconnects.
    staleTimes: {
      dynamic: 30,
    },
    // Lets a chat slide in over the inbox and back out (messages/[threadId]/layout.tsx).
    viewTransition: true,
  },
  images: {
    // Allow next/image to optimise user media served from Supabase storage.
    // Any host not listed here is handled by <OptimizedImage>, which falls
    // back to a plain <img> so an unexpected URL can never break a render.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fyaioseridqabockidyp.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Force HTTPS for 2 years; preload-ready
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Block clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Referrer policy
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Basic XSS protection for older browsers
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // No X-Robots-Tag here. It was set while the app was invite-only
          // and would now keep shared profiles, posts and Shots out of
          // search entirely — including the /u/ links the profile QR
          // resolves to, and the privacy and terms pages Google's OAuth
          // review fetches.
        ],
      },
    ];
  },
  // Note: domain redirects are handled by Vercel's CDN layer. Adding them
  // here too causes ERR_TOO_MANY_REDIRECTS.
};

export default withSentryConfig(nextConfig, {
  // Suppress the Sentry CLI upload logs during build
  silent: !process.env.CI,
  // Don't upload source maps unless SENTRY_AUTH_TOKEN is set
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Disable source map upload if no auth token (safe default)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Turbopack-safe: don't inject auto-instrumentation wrappers
  autoInstrumentServerFunctions: false,
  autoInstrumentMiddleware: false,
});
