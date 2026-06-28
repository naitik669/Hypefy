"use client";

/**
 * Root error boundary. Kept free of any @sentry/nextjs import — the Sentry
 * client SDK doesn't instantiate cleanly under Next 16's Turbopack and was
 * blanking client pages. Server-side errors are still captured via
 * instrumentation.ts (onRequestError). Client render errors are surfaced to
 * the user here; wire a client reporter later if needed.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100dvh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#8a8a8a" }}>Please try again.</p>
          <button
            type="button"
            onClick={() => { window.location.href = "/home"; }}
            style={{ marginTop: 8, borderRadius: 999, background: "#c8ff00", color: "#0a0a0a", border: 0, padding: "10px 20px", fontWeight: 700 }}
          >
            Back to home
          </button>
        </div>
      </body>
    </html>
  );
}
