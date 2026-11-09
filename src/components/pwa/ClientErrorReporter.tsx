"use client";

import { useEffect } from "react";

const MAX_PER_SESSION = 5;

/** Health reports are rarer and quieter than errors; they get their own budget. */
const MAX_HEALTH_PER_SESSION = 3;

/** A task this long has already dropped frames; past a second it reads as a freeze. */
const LONG_TASK_MS = 1000;

/** How often to look at the heap. Rare on purpose: this runs for every signed-in user. */
const HEALTH_EVERY_MS = 30_000;

/** Consecutive rises in used heap before we call it growth rather than noise. */
const RISES_BEFORE_REPORTING = 4;

/** Chromium-only, and not in every build, so it is read defensively. */
type MaybeMemory = { memory?: { usedJSHeapSize?: number } };

/**
 * What the page is carrying right now.
 *
 * Both numbers are the subject of the crash work: a feed that never
 * unmounts grows the node count without bound, and a reel list that
 * keeps every slide's <video> alive exhausts the WebView's decoders.
 * Sending them with every report means a freeze arrives with the two
 * measurements that explain it, instead of a stack with no context.
 */
function vitals() {
  try {
    return {
      nodes: document.getElementsByTagName("*").length,
      videos: document.getElementsByTagName("video").length,
      heap: (performance as Performance & MaybeMemory).memory?.usedJSHeapSize ?? null,
    };
  } catch {
    return { nodes: null, videos: null, heap: null };
  }
}

/**
 * Lightweight client telemetry, mounted once in the root layout.
 *
 * Uncaught errors and unhandled rejections are relayed to
 * /api/client-error (which forwards to the server-side Sentry), so the
 * browser bundle never ships the Sentry SDK. Deduped by message, capped
 * per session, silent on failure — reporting must never become its own
 * source of noise.
 *
 * It also watches for the failure this reporter could not previously
 * see at all. **A freeze throws nothing**: no error, no rejection, so
 * the two listeners below never fire and the one symptom users actually
 * report left no trace anywhere. A long task and a heap that only grows
 * are the two signals that do show it, so they are reported too — under
 * their own small budget, because unlike an exception they are not
 * self-limiting.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;
    let health = 0;

    function post(body: Record<string, unknown>) {
      try {
        fetch("/api/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // keepalive so reports survive navigation/unload
          body: JSON.stringify({ ...body, url: window.location.pathname }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* never throw from the reporter */
      }
    }

    function report(kind: "error" | "unhandledrejection", message: string, stack?: string) {
      if (!message || sent >= MAX_PER_SESSION) return;
      const key = message.slice(0, 200);
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      post({ kind, message: message.slice(0, 500), stack: (stack ?? "").slice(0, 4000) });
    }

    function reportHealth(kind: "longtask" | "memory", message: string) {
      if (health >= MAX_HEALTH_PER_SESSION) return;
      health++;
      post({ kind, message, ...vitals() });
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

    // The main thread stalling. Only the longest ones: a 60ms task is a
    // jank, a 1s task is the user deciding the app is broken.
    let observer: PerformanceObserver | null = null;
    try {
      if (typeof PerformanceObserver === "function") {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= LONG_TASK_MS) {
              reportHealth("longtask", `main thread blocked ${Math.round(entry.duration)}ms`);
              return;
            }
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      }
    } catch {
      // Safari and older WebViews do not know "longtask"; observe() throws.
      observer = null;
    }

    // A heap that only ever rises. One high reading means nothing — a
    // run of rises with no collection in between is the leak.
    let last = 0;
    let rises = 0;
    const timer = window.setInterval(() => {
      const used = (performance as Performance & MaybeMemory).memory?.usedJSHeapSize;
      if (typeof used !== "number") return;
      rises = used > last ? rises + 1 : 0;
      last = used;
      if (rises >= RISES_BEFORE_REPORTING) {
        rises = 0;
        reportHealth("memory", `heap rose ${RISES_BEFORE_REPORTING} samples running`);
      }
    }, HEALTH_EVERY_MS);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      observer?.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
