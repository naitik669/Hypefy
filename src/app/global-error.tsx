"use client";

/**
 * Root error boundary. Kept free of any @sentry/nextjs import — the Sentry
 * client SDK doesn't instantiate cleanly under Next 16's Turbopack and was
 * blanking client pages. Server-side errors are still captured via
 * instrumentation.ts (onRequestError). Inline styles are intentional:
 * this can render when the app shell (and its CSS) failed, so it must be
 * fully self-contained — visually matched to offline.html.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          color: "#fff",
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100dvh",
            maxWidth: 480,
            margin: "0 auto",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 32,
            textAlign: "center",
          }}
        >
          {/* Dashed brand mark, matching offline.html */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#141414",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden>
              <circle cx="20" cy="20" r="14" stroke="#a3e635" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="2 4.2" fill="none" />
              <circle cx="20" cy="20" r="3.2" fill="#a3e635" />
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>
              Something broke<span style={{ color: "#a3e635" }}>.</span>
            </h1>
            <p style={{ margin: "6px auto 0", maxWidth: 260, fontSize: 14, lineHeight: 1.45, color: "#8a8a8a" }}>
              Not you — us. Head back and we&apos;ll get the hype going again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { window.location.href = "/home"; }}
            style={{
              marginTop: 4,
              borderRadius: 999,
              background: "#a3e635",
              color: "#0a0a0a",
              border: 0,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Back to home
          </button>
        </div>
      </body>
    </html>
  );
}
