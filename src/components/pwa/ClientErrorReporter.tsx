"use client";

import { useEffect } from "react";

const MAX_PER_SESSION = 5;

/**
 * Lightweight client error telemetry, mounted once in the root layout.
 * Uncaught errors and unhandled rejections are relayed to /api/client-error
 * (which forwards to the server-side Sentry), so the browser bundle never
 * ships the Sentry SDK. Deduped by message, capped per session, silent on
 * failure — reporting must never become its own source of noise.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;

    function report(kind: "error" | "unhandledrejection", message: string, stack?: string) {
      if (!message || sent >= MAX_PER_SESSION) return;
      const key = message.slice(0, 200);
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      try {
        const payload = JSON.stringify({
          kind,
          message: message.slice(0, 500),
          stack: (stack ?? "").slice(0, 4000),
          url: window.location.pathname,
        });
        // keepalive so reports survive navigation/unload
        fetch("/api/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* never throw from the reporter */
      }
    }

    function onError(e: ErrorEvent) {
      // Ignore muffled cross-origin script noise
      if (e.message === "Script error." && !e.filename) return;
      report("error", e.message, e.error?.stack);
    }
    function onRejection(e: PromiseRejectionEvent) {
      const r = e.reason;
      const message = r instanceof Error ? r.message : typeof r === "string" ? r : "Unhandled rejection";
      report("unhandledrejection", message, r instanceof Error ? r.stack : undefined);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
