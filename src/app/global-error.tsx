"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Root error boundary — reports uncaught render errors to Sentry. */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100dvh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#8a8a8a" }}>The issue has been logged. Please try again.</p>
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
