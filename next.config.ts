import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
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
        ],
      },
    ];
  },
  // Note: www→root and HTTP→HTTPS redirects are handled by Vercel's CDN layer.
  // Adding them here too causes ERR_TOO_MANY_REDIRECTS.
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
