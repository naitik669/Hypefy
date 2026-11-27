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
    // `experimental.viewTransition` was here, letting a chat slide in over
    // the inbox and back out (messages/[threadId]/layout.tsx). The flag was
    // removed in Next 16.3.0 — the bundled upgrade guide says so and says
    // what to do: "Remove the flag. View transitions work in the App Router
    // without configuration." So the behaviour stays and the flag goes.
    /**
     * Only load the icons actually used, rather than the whole barrel.
     *
     * lucide-react is deliberately absent: Next already ships it in its
     * own default list (see the array in next/dist/server/config.js),
     * so naming it here changes nothing. @phosphor-icons/react is not
     * in that list, and six files import from it — BottomNav imports
     * from both libraries for one nav bar, which is worth collapsing
     * to one, but that is a visual change and belongs in a design pass
     * rather than here.
     */
    optimizePackageImports: ["@phosphor-icons/react"],
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
      /*
       * The cutout sticker studio, and nothing else, is cross-origin
       * isolated: that is what lets its WebAssembly model run on several
       * threads (3-4 s a photo instead of ~11 s, measured). Isolation stops
       * cross-origin images and scripts that do not opt in, so it would
       * break avatars, embeds and checkout if it reached any other page.
       * See src/app/stickers/new/page.tsx for why the page is entered and
       * left with full navigations.
       */
      {
        source: "/stickers/new",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      /*
       * The studio's worker and runtime need the same headers as the page.
       * Measured, not assumed: with COEP on the page alone, an isolated page
       * refuses to start the worker at all, and the cut never runs.
       */
      {
        source: "/cutout/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      /*
       * The 46 MB model never changes under its name (a new model gets a new
       * file name, see src/lib/cutout/model-loader.ts), so it caches for good.
       */
      {
        source: "/cutout/isnet-general-use-q8.onnx",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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
          /*
           * Content-Security-Policy, REPORT ONLY for now.
           *
           * There was no CSP at all, which matters more here than on most
           * apps: src/lib/saved-accounts.ts keeps every signed-in account's
           * Supabase refresh token in localStorage so the account switcher
           * can call setSession() with it. Any script on this origin can
           * read those, and a refresh token is a durable credential — so the
           * worst case is not a defaced page, it is persistent takeover of
           * every account that has ever signed in on that browser.
           *
           * The app has no dangerouslySetInnerHTML anywhere and React
           * escapes JSX, so the direct injection surface is small. The
           * exposure is third-party script: Google's ad network, Tag
           * Manager, Razorpay's checkout, Spotify's playback SDK. That is
           * precisely what a CSP contains, and precisely what an ENFORCING
           * policy with one origin wrong would break silently for everyone.
           *
           * So it reports and does not block. Violations go to
           * /api/csp-report, which forwards them to the Sentry that is
           * already wired server-side. Turning it on for real is a separate
           * change, made once the reports say what the policy is missing —
           * which cannot be known by reading the code, because a third-party
           * script's own fetches do not appear in it.
           *
           * 'unsafe-inline' and 'unsafe-eval' are in script-src on purpose:
           * Next's hydration bootstrap is inline, and dropping them would
           * fill the reports with the framework's own noise rather than the
           * app's real gaps. Tightening to a nonce is the step after this.
           */
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              // Next's inline bootstrap, plus the third-party SDKs.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://www.googletagmanager.com https://checkout.razorpay.com https://sdk.scdn.co https://www.google.com https://va.vercel-scripts.com",
              // Tailwind emits a stylesheet, but next/font and several
              // components set style attributes, which is style-src-attr.
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              // Avatars and post media come from Supabase storage; ad and
              // Giphy images from their own hosts; data: for generated art.
              "img-src 'self' data: blob: https:",
              "media-src 'self' data: blob: https:",
              // Supabase REST and realtime (wss), the APIs the app calls,
              // and Sentry's ingest.
              "connect-src 'self' https: wss:",
              // Razorpay and the ad network both frame themselves in.
              "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://pagead2.googlesyndication.com https://www.google.com",
              // Nothing should be framing US — X-Frame-Options says so too,
              // and this is the modern spelling of it.
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "report-uri /api/csp-report",
            ].join("; "),
          },
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
