import {
  HEALTH_EVERY_MS,
  LONG_TASK_MS,
  newBudget,
  nextReport,
  type ReportKind,
} from "@hypefy/core/client-report";


/**
 * Crash and freeze reporting, with no Sentry SDK and no DSN.
 *
 * **This was wrongly recorded as blocked.** The reasoning was that the app
 * needs a Sentry DSN, which is a server environment variable this machine
 * cannot read. It does not: the website already relays client failures
 * through `/api/client-error`, which forwards them to the server-side
 * Sentry precisely so that the browser bundle never ships the SDK. The
 * phone posts to the same endpoint. No native module either, so this ships
 * over the air rather than waiting for a build.
 *
 * It also means the two clients land in ONE Sentry stream with the same
 * four `kind` tags, which is the only way "crash-free sessions" can be read
 * across both.
 *
 * **The signals are not the browser's, so each one is a decision rather
 * than a port:**
 *
 *  - `error` — React Native's own `ErrorUtils` global handler, which is
 *    where every uncaught JS error in the app ends up, fatal or not.
 *  - `longtask` — there is no PerformanceObserver here, so a blocked JS
 *    thread is measured by how late a timer arrives. Crude and real: this
 *    is the one signal that catches the failure the audit put at the centre
 *    of the native rewrite — a video pipeline that runs out of decoders
 *    freezes rather than throwing.
 *  - `unhandledrejection` — **NOT reported, and not pretended to be.**
 *    React Native's rejection tracking is a polyfill over the `promise`
 *    package, and with Hermes the global Promise is Hermes's own, so
 *    enabling it may silently do nothing. A reporter that looks installed
 *    and reports nothing is worse than one that is absent and said to be.
 *  - `memory` — no `performance.memory` outside Chromium. Absent.
 */

/** Where the relay lives. The same origin the app already talks to. */
export const REPORT_PATH = "/api/client-error";

/**
 * Overshoot before a late timer is called a blocked thread.
 *
 * A timer in React Native is never exact, and a few hundred milliseconds of
 * drift is ordinary scheduling. The web's threshold for "this reads as a
 * freeze" is a full second of blocked main thread, so the same figure is
 * used here: lateness BEYOND the interval, not the interval itself.
 */
export function stallMs(expectedMs: number, actualMs: number): number {
  return Math.max(0, Math.round(actualMs - expectedMs));
}

export function isStall(expectedMs: number, actualMs: number): boolean {
  return stallMs(expectedMs, actualMs) >= LONG_TASK_MS;
}

type Poster = (url: string, body: string) => void;

/** `fetch`, with its rejection swallowed. */
const defaultPost: Poster = (url, body) => {
  // The rejection only. A synchronous throw is caught by the caller, and
  // two guards for one failure is dead weight pretending to be a safeguard
  // — which this repository has removed twice already.
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
};

type Handlers = {
  /**
   * Where the relay is.
   *
   * Passed in rather than imported, so this module pulls in nothing
   * native and a Node test can drive it. site.ts imports expo-constants,
   * and importing that here would make the whole module unevaluatable
   * under Vitest — which would leave the tests reading it as text, the
   * trap this repository keeps falling into.
   */
  site: string;
  /** React Native's global error hook. Injected so a test can drive it. */
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  now?: () => number;
  post?: Poster;
};

/**
 * Start reporting. Returns the teardown.
 *
 * Everything it touches is injectable, because the alternative is a module
 * that can only be read as text — the trap this repository keeps falling
 * into, and the reason avatar-color.ts and dob-parts.ts exist.
 */
export function startReporting(handlers: Handlers): () => void {
  const post = handlers.post ?? defaultPost;
  const site = handlers.site;
  const now = handlers.now ?? (() => Date.now());
  const setEvery = handlers.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearEvery = handlers.clearInterval ?? ((h) => clearInterval(h as never));

  const budget = newBudget();

  const send = (kind: ReportKind, message: string, stack?: string) => {
    /*
     * **Guarded here, at the call site, and not only inside the poster.**
     *
     * A transport that throws SYNCHRONOUSLY would otherwise propagate out
     * of the global error handler below: a failure thrown while handling a
     * failure, which replaces a diagnosable crash with an undiagnosable
     * one. The promise rejection is a different event and is caught on the
     * promise; neither guard covers the other.
     *
     * Found by the test named for it, which failed on the first run.
     */
    try {
      const payload = nextReport(budget, { kind, message, stack, url: "app" });
      if (!payload) return;
      post(`${site}${REPORT_PATH}`, JSON.stringify(payload));
    } catch {
      // Reporting must never become its own source of failure.
    }
  };

  /*
   * The previous handler is called afterwards, always.
   *
   * React Native's default handler is what shows the red screen in
   * development and what ends the process on a fatal error in production.
   * Replacing it rather than wrapping it would mean a crash that was
   * reported and then silently swallowed — the app would sit there broken
   * with no screen and no exit, which is worse than the crash.
   */
  const errorUtils = (globalThis as { ErrorUtils?: NonNullable<unknown> }).ErrorUtils as
    | {
        setGlobalHandler?: (h: (error: unknown, isFatal?: boolean) => void) => void;
        getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      }
    | undefined;

  const setHandler = handlers.setGlobalHandler ?? errorUtils?.setGlobalHandler?.bind(errorUtils);
  const getHandler = handlers.getGlobalHandler ?? errorUtils?.getGlobalHandler?.bind(errorUtils);
  const previous = getHandler?.();

  if (setHandler) {
    setHandler((error: unknown, isFatal?: boolean) => {
      const err = error as { message?: unknown; stack?: unknown } | null;
      const message =
        err && typeof err.message === "string" && err.message
          ? err.message
          : typeof error === "string" && error
            ? error
            : "Unknown error";
      // Fatality is in the message rather than in a tag: the relay's tags
      // are the four kinds, and inventing a fifth puts reports in a bucket
      // nobody is looking at.
      send("error", isFatal ? `[fatal] ${message}` : message, typeof err?.stack === "string" ? err.stack : undefined);
      previous?.(error, isFatal);
    });
  }

  /*
   * A blocked JS thread, measured by a late timer.
   *
   * The interval is the web's health cadence, so the two clients sample at
   * the same rate and one is not noisier than the other for no reason.
   */
  let lastTick = now();
  const timer = setEvery(() => {
    const at = now();
    const late = stallMs(HEALTH_EVERY_MS, at - lastTick);
    lastTick = at;
    if (late >= LONG_TASK_MS) {
      send("longtask", `js thread blocked ${late}ms`);
    }
  }, HEALTH_EVERY_MS);

  return () => {
    clearEvery(timer);
    // The handler is put back rather than left pointing at a torn-down
    // reporter. Nothing unmounts the root today, so this is for the day
    // something does.
    if (setHandler && previous) setHandler(previous);
  };
}
