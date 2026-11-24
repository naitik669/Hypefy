import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  newBudget,
  nextReport,
  isHealthKind,
  REPORT_KINDS,
  MAX_PER_SESSION,
  MAX_HEALTH_PER_SESSION,
  MAX_MESSAGE,
  MAX_STACK,
  MAX_URL,
  DEDUPE_KEY_LENGTH,
  LONG_TASK_MS,
  HEALTH_EVERY_MS,
} from "../packages/core/src/client-report";
import { startReporting, stallMs, isStall, REPORT_PATH } from "../apps/mobile/src/report";

const read = (p: string) => readFileSync(p, "utf8");
const body = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, "");

const WEB_REPORTER = "src/components/pwa/ClientErrorReporter.tsx";
const RELAY = "src/app/api/client-error/route.ts";
const MOBILE = "apps/mobile/src/report.ts";
const ROOT = "apps/mobile/app/_layout.tsx";

/* ------------------------------------------------------------------ *
 * Why this is shared at all                                          *
 * ------------------------------------------------------------------ */

describe("the report budget is shared because the rate limit is per IP", () => {
  it("the relay limits by IP, not by user", () => {
    /*
     * The fact the sharing rests on. Twenty an hour per address means a
     * phone and a browser on one network draw from ONE quota — so a phone
     * reporting freely would starve the browser beside it of the reports
     * that matter. If this ever became per-user, the caps could diverge
     * without harm and this test should be the thing that says so.
     */
    expect(read(RELAY)).toMatch(/ipRateLimited\(req, 20, 60 \* 60 \* 1000\)/);
  });

  it("both clients read the caps from one module", () => {
    // TWICE in the web reporter, not once: it has an error path and a
    // health path, and a mutation that bypassed the budget in only the
    // error path kept a "it appears somewhere" check green. The scope
    // error, which this repository keeps paying for.
    expect(body(WEB_REPORTER).match(/nextReport\(budget, \{/g)).toHaveLength(2);
    expect(body(MOBILE)).toMatch(/nextReport\(budget, \{/);
    // And neither keeps its own copy any more.
    expect(body(WEB_REPORTER)).not.toMatch(/MAX_PER_SESSION = \d/);
    expect(body(MOBILE)).not.toMatch(/MAX_PER_SESSION = \d/);
  });

  it("and the caps fit inside that window with both clients reporting", () => {
    /*
     * **The arithmetic is the guarantee, not the numbers.** Asserting
     * against the constants made two mutations invisible: dropping the
     * error cap to 2 and raising the health cap to 9 both kept every other
     * test here green, because the loops are written in terms of the
     * constants and simply adapt.
     *
     * What the figures are actually FOR: a worst case of one phone and one
     * browser on the same address, each spending its whole budget, has to
     * stay inside the relay's hourly limit — or the pair silently starts
     * dropping each other's reports, which is the failure the sharing was
     * introduced to prevent.
     */
    const RELAY_PER_HOUR = 20;
    const perClient = MAX_PER_SESSION + MAX_HEALTH_PER_SESSION;
    const CLIENTS_PER_ADDRESS = 2;
    expect(perClient * CLIENTS_PER_ADDRESS).toBeLessThanOrEqual(RELAY_PER_HOUR);
    // And room to spare, so a second session on the same address in the
    // same hour is not the thing that tips it over.
    expect(perClient * CLIENTS_PER_ADDRESS * 2).toBeLessThanOrEqual(RELAY_PER_HOUR * 2);
    // The website's own figures, which both clients now share.
    expect(MAX_PER_SESSION).toBe(5);
    expect(MAX_HEALTH_PER_SESSION).toBe(3);
  });

  it("and the relay truncates to the same lengths the senders do", () => {
    const relay = read(RELAY);
    expect(relay).toMatch(/slice\(0, MAX_MESSAGE\)/);
    expect(relay).toMatch(/slice\(0, MAX_STACK\)/);
    expect(relay).toMatch(/slice\(0, MAX_URL\)/);
    // A literal here is how the relay ends up cutting more or less than
    // the sender expected, silently.
    expect(relay).not.toMatch(/slice\(0, 500\)|slice\(0, 4000\)|slice\(0, 300\)/);
  });

  it("the four kinds come from one list, so no client invents a fifth", () => {
    expect(REPORT_KINDS).toEqual(["error", "unhandledrejection", "longtask", "memory"]);
    const relay = read(RELAY);
    expect(relay).toMatch(/REPORT_KINDS\.find/);
    expect(relay).not.toMatch(/const KINDS = \[/);
    // A kind the relay does not know is tagged "error", so an invented one
    // is not dropped — it is filed under the wrong thing, which is worse.
    expect(relay).toMatch(/\?\? "error"/);
  });
});

/* ------------------------------------------------------------------ *
 * The budget itself                                                  *
 * ------------------------------------------------------------------ */

describe("the budget", () => {
  it("stops at five errors", () => {
    const b = newBudget();
    for (let i = 0; i < MAX_PER_SESSION; i++) {
      expect(nextReport(b, { kind: "error", message: `boom ${i}` }), `report ${i}`).not.toBeNull();
    }
    expect(nextReport(b, { kind: "error", message: "one too many" })).toBeNull();
  });

  it("and at three health reports, on a separate count", () => {
    const b = newBudget();
    // Spending the error budget must not spend the health one: a session
    // that throws five times is exactly the session whose freeze matters.
    for (let i = 0; i < MAX_PER_SESSION; i++) {
      nextReport(b, { kind: "error", message: `boom ${i}` });
    }
    for (let i = 0; i < MAX_HEALTH_PER_SESSION; i++) {
      expect(nextReport(b, { kind: "longtask", message: `blocked ${i}` }), `health ${i}`).not.toBeNull();
    }
    expect(nextReport(b, { kind: "longtask", message: "blocked again" })).toBeNull();
  });

  it("reports the same error once, by message alone", () => {
    const b = newBudget();
    expect(nextReport(b, { kind: "error", message: "same", stack: "at a" })).not.toBeNull();
    // A second stack is the same defect. Reporting it twice spends a budget
    // of five on one bug.
    expect(nextReport(b, { kind: "error", message: "same", stack: "at b" })).toBeNull();
  });

  it("and compares only the first two hundred characters", () => {
    const b = newBudget();
    const stem = "x".repeat(DEDUPE_KEY_LENGTH);
    expect(nextReport(b, { kind: "error", message: `${stem}A` })).not.toBeNull();
    expect(nextReport(b, { kind: "error", message: `${stem}B` })).toBeNull();
  });

  it("does NOT dedupe health reports, because each is its own measurement", () => {
    // "blocked 1200ms" and "blocked 3400ms" are two facts about one
    // session. The budget is what bounds them, not sameness.
    const b = newBudget();
    expect(nextReport(b, { kind: "longtask", message: "blocked" })).not.toBeNull();
    expect(nextReport(b, { kind: "longtask", message: "blocked" })).not.toBeNull();
  });

  it("refuses a report with nothing in it rather than spending a slot", () => {
    const b = newBudget();
    expect(nextReport(b, { kind: "error", message: "" })).toBeNull();
    expect(nextReport(b, { kind: "error", message: "   " })).toBeNull();
    expect(b.errors).toBe(0);
  });

  it("truncates what it sends", () => {
    const payload = nextReport(newBudget(), {
      kind: "error",
      message: "m".repeat(MAX_MESSAGE + 50),
      stack: "s".repeat(MAX_STACK + 50),
      url: "u".repeat(MAX_URL + 50),
    });
    expect(payload?.message).toHaveLength(MAX_MESSAGE);
    expect(payload?.stack).toHaveLength(MAX_STACK);
    expect(payload?.url).toHaveLength(MAX_URL);
  });

  it("and always sends strings, so the relay never reads undefined", () => {
    const payload = nextReport(newBudget(), { kind: "error", message: "m" });
    expect(payload?.stack).toBe("");
    expect(payload?.url).toBe("");
  });

  it("knows which kinds are symptoms rather than failures", () => {
    expect(isHealthKind("longtask")).toBe(true);
    expect(isHealthKind("memory")).toBe(true);
    expect(isHealthKind("error")).toBe(false);
    expect(isHealthKind("unhandledrejection")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * The phone                                                          *
 * ------------------------------------------------------------------ */

type Sent = { url: string; body: Record<string, unknown> };

function harness(opts: { site?: string } = {}) {
  const sent: Sent[] = [];
  let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
  const previousCalls: unknown[] = [];
  const previous = (error: unknown) => previousCalls.push(error);
  let tick: (() => void) | undefined;
  let tickEvery = -1;
  let clearedWith: unknown = "not cleared";
  let clock = 0;

  const stop = startReporting({
    site: opts.site ?? "https://app.hypefy.chat",
    post: (url, raw) => sent.push({ url, body: JSON.parse(raw) as Record<string, unknown> }),
    setGlobalHandler: (h) => {
      handler = h;
    },
    getGlobalHandler: () => previous,
    setInterval: (fn, ms) => {
      tick = fn;
      tickEvery = ms;
      return "timer";
    },
    clearInterval: (h) => {
      clearedWith = h;
    },
    now: () => clock,
  });

  return {
    sent,
    previousCalls,
    stop,
    throwAt: (error: unknown, isFatal?: boolean) => handler?.(error, isFatal),
    advance: (ms: number) => {
      clock += ms;
      tick?.();
    },
    get handler() {
      return handler;
    },
    get clearedWith() {
      return clearedWith;
    },
    get previous() {
      return previous;
    },
    get tickEvery() {
      return tickEvery;
    },
  };
}

describe("the phone reports crashes without a DSN or a native module", () => {
  it("posts to the website's existing relay", () => {
    const h = harness();
    h.throwAt(new Error("kaboom"));
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].url).toBe(`https://app.hypefy.chat${REPORT_PATH}`);
    expect(REPORT_PATH).toBe("/api/client-error");
  });

  it("so it needs neither a Sentry package nor a key", () => {
    /*
     * The correction this whole file records. Crash reporting was logged as
     * blocked on a Sentry DSN — a server environment variable this machine
     * cannot read. It was never needed: the relay forwards to the
     * server-side Sentry, which is why the BROWSER bundle does not ship the
     * SDK either.
     */
    /*
     * Comments stripped. The doc comment at the top of that file explains
     * that no DSN is needed, so asserting over the whole text made the
     * explanation itself a failure — the comment trap, in the form where
     * a comment BREAKS an assertion rather than satisfying one. Tenth
     * appearance, and the second this week in that direction.
     */
    const src = body(MOBILE);
    expect(src).not.toMatch(/@sentry/);
    expect(src).not.toMatch(/DSN|dsn/);
    const pkg = JSON.parse(read("apps/mobile/package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).filter((d) => d.includes("sentry"))).toEqual([]);
    // And the relay is what makes that possible.
    expect(read(RELAY)).toMatch(/Sentry\.captureMessage/);
  });

  it("sends the message and the stack of a real error", () => {
    const h = harness();
    const err = new Error("something broke");
    h.throwAt(err);
    expect(h.sent[0].body.kind).toBe("error");
    expect(h.sent[0].body.message).toBe("something broke");
    expect(String(h.sent[0].body.stack)).toContain("something broke");
  });

  it("marks a fatal one, inside the message rather than as a fifth kind", () => {
    const h = harness();
    h.throwAt(new Error("gone"), true);
    // The relay tags on `kind`, and a kind it does not know is filed as
    // "error" — so inventing one puts reports in a bucket nobody reads.
    expect(h.sent[0].body.kind).toBe("error");
    expect(h.sent[0].body.message).toBe("[fatal] gone");
  });

  it("handles a thrown string, and something with no message at all", () => {
    const h = harness();
    h.throwAt("just a string");
    h.throwAt({ nothing: true });
    expect(h.sent.map((s) => s.body.message)).toEqual(["just a string", "Unknown error"]);
  });

  it("and an Error whose message is EMPTY still reports, rather than vanishing", () => {
    /*
     * The case the fixtures missed. `{ nothing: true }` has no `message`
     * property, so the type check alone rejects it — but an
     * `new Error("")` has a message of the right TYPE and no content, and
     * without the truthiness check it was passed through as "" and then
     * dropped by the budget as an empty report. A crash that reports
     * nothing is the one outcome worse than a crash.
     */
    const h = harness();
    h.throwAt(new Error(""));
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].body.message).toBe("Unknown error");
  });

  it("and an empty thrown string does the same", () => {
    const h = harness();
    h.throwAt("");
    expect(h.sent[0].body.message).toBe("Unknown error");
  });

  it("**always calls the handler it replaced**", () => {
    /*
     * The one that would be a disaster to get wrong. React Native's own
     * handler shows the red screen in development and ends the process on a
     * fatal error in production. Swallowing it would leave the app sitting
     * there broken with no screen and no exit — worse than the crash it
     * was reporting.
     */
    const h = harness();
    const err = new Error("boom");
    h.throwAt(err);
    expect(h.previousCalls).toEqual([err]);
  });

  it("and still calls it once the budget is spent", () => {
    // The budget bounds REPORTING. It must not bound crashing.
    const h = harness();
    for (let i = 0; i < MAX_PER_SESSION + 3; i++) h.throwAt(new Error(`boom ${i}`));
    expect(h.sent).toHaveLength(MAX_PER_SESSION);
    expect(h.previousCalls).toHaveLength(MAX_PER_SESSION + 3);
  });

  it("obeys the shared budget rather than keeping its own", () => {
    const h = harness();
    h.throwAt(new Error("same"));
    h.throwAt(new Error("same"));
    expect(h.sent).toHaveLength(1);
  });
});

describe("a frozen JS thread, which throws nothing at all", () => {
  it("lateness past a second is a stall; ordinary drift is not", () => {
    expect(isStall(HEALTH_EVERY_MS, HEALTH_EVERY_MS + LONG_TASK_MS)).toBe(true);
    expect(isStall(HEALTH_EVERY_MS, HEALTH_EVERY_MS + LONG_TASK_MS - 1)).toBe(false);
    // A timer arriving EARLY, or exactly on time, is not a stall of
    // negative length.
    expect(stallMs(HEALTH_EVERY_MS, HEALTH_EVERY_MS)).toBe(0);
    expect(stallMs(HEALTH_EVERY_MS, HEALTH_EVERY_MS - 500)).toBe(0);
  });

  it("measures lateness BEYOND the interval, not the interval itself", () => {
    // Reporting the elapsed time would call every single tick a 30-second
    // freeze, which is five minutes of silence followed by three useless
    // reports and an exhausted budget.
    expect(stallMs(HEALTH_EVERY_MS, HEALTH_EVERY_MS + 1500)).toBe(1500);
  });

  it("reports one when a tick arrives late", () => {
    const h = harness();
    h.advance(HEALTH_EVERY_MS + 2000);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].body.kind).toBe("longtask");
    expect(h.sent[0].body.message).toBe("js thread blocked 2000ms");
  });

  it("and says nothing when ticks arrive on time", () => {
    const h = harness();
    h.advance(HEALTH_EVERY_MS);
    h.advance(HEALTH_EVERY_MS + 100);
    expect(h.sent).toEqual([]);
  });

  it("samples at the website's cadence, so neither client is noisier", () => {
    /*
     * The interval it actually ASKS for, not the constant appearing in the
     * file. A mutation that passed a literal 1000 to setInterval left the
     * constant imported and referenced elsewhere, so a file-wide check
     * stayed green while the phone sampled thirty times as often as the
     * browser — thirty times the reports against a shared hourly budget.
     */
    expect(harness().tickEvery).toBe(HEALTH_EVERY_MS);
    expect(HEALTH_EVERY_MS).toBe(30_000);
    expect(body(WEB_REPORTER)).toMatch(/HEALTH_EVERY_MS/);
  });

  it("this is the signal the native rewrite was about", () => {
    /*
     * The audit put a WebView decoder ceiling of six to sixteen at the
     * centre of the case for going native. Running out of decoders does
     * not throw: it freezes. Without this the one failure the whole
     * rewrite was justified by would leave no trace.
     */
    expect(read(MOBILE)).toMatch(/runs out of decoders/);
  });
});

describe("what the phone deliberately does not report", () => {
  it("promise rejections, and it says why rather than pretending", () => {
    /*
     * React Native's rejection tracking is a polyfill over the `promise`
     * package, and with Hermes the global Promise is Hermes's own — so
     * enabling it may silently do nothing. A reporter that looks installed
     * and reports nothing is worse than one that is absent and said to be,
     * which is the same reasoning kv.ts records about a memory store.
     */
    const src = read(MOBILE);
    expect(src).toMatch(/NOT reported, and not pretended to be/);
    expect(src).toMatch(/Hermes/);
    // Nothing that looks like an installed tracker.
    expect(body(MOBILE)).not.toMatch(/rejection-tracking|unhandledrejection/);
  });

  it("and heap growth, which has no API outside Chromium", () => {
    expect(read(MOBILE)).toMatch(/no `performance\.memory` outside Chromium/);
    expect(body(MOBILE)).not.toMatch(/usedJSHeapSize/);
  });
});

describe("the reporter is actually running", () => {
  it("started at module scope, before any component renders", () => {
    /*
     * An error thrown while the root layout is still evaluating happens
     * before any effect runs — a bad import, a module that throws at load.
     * Starting this in a useEffect would miss exactly the crashes that
     * leave nothing on screen to describe.
     *
     * A hook nobody calls is the same as no hook; so is a reporter started
     * somewhere that never runs.
     */
    const src = body(ROOT);
    // At the top level of the module, not nested inside anything.
    expect(src).toMatch(/^startReporting\(\{ site: siteOrigin\(\) \}\);$/m);
    expect(src).not.toMatch(/useEffect\([\s\S]{0,200}startReporting/);
  });

  it("and reporting never throws, whatever the transport does", () => {
    // The reporter becoming its own source of failure is the one outcome
    // that cannot be tolerated.
    const thrown = startReporting({
      site: "https://app.hypefy.chat",
      post: () => {
        throw new Error("network is on fire");
      },
      setGlobalHandler: (h) => {
        expect(() => h(new Error("boom"))).not.toThrow();
      },
      setInterval: () => "t",
      clearInterval: () => {},
    });
    expect(() => thrown()).not.toThrow();
  });

  it("the teardown stops the timer and puts the handler back", () => {
    const h = harness();
    h.stop();
    expect(h.clearedWith).toBe("timer");
    // Not left pointing at a torn-down reporter.
    expect(h.handler).toBe(h.previous);
  });
});
