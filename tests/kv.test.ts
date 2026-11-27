import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import {
  type Kv,
  absentKv,
  installKv,
  kv,
  kvInstalled,
  memoryKv,
  resetKv,
  readJson,
  writeJson,
} from "@hypefy/core/kv";
import { webKv } from "@/lib/kv-web";

/**
 * The key-value store the shared core reads device-local things through.
 *
 * Deferred from Phase 2 deliberately — designing an adapter with one
 * consumer is guesswork — and every decision in it came from measuring the
 * twenty modules that touch storage rather than from taste. Those
 * measurements are asserted here too, because they are the reasons.
 */

const read = (p: string) => readFileSync(p, "utf8");

// The suite installs webKv globally (tests/setup.ts), exactly as the root
// layout does in the browser. These tests take it apart and put it back.
afterEach(() => {
  installKv(webKv);
});

describe("the interface is the one the consumers forced", () => {
  it("is synchronous, because three consumers return a stored value directly", () => {
    // readSpeed() hands back a number and loadRecentSearches() an array,
    // both out of non-async functions. An async store changes their
    // signatures and every call site — which is why the native backing is
    // MMKV rather than SecureStore or AsyncStorage, both of which are async.
    const store: Kv = memoryKv();
    store.set("k", "v");
    // Not a promise: if this were async, `get` would return one and this
    // comparison would fail rather than pass on a thenable.
    const got: string | null = store.get("k");
    expect(got).toBe("v");
    expect(got).not.toBeInstanceOf(Promise);
  });

  it("never throws, because every consumer already swallowed", () => {
    // localStorage throws in a private window and on a full quota, and all
    // eleven pure consumers wrapped each call. That belongs in one place.
    const hostile: Kv = {
      get() {
        throw new Error("blocked");
      },
      set() {
        throw new Error("blocked");
      },
      remove() {
        throw new Error("blocked");
      },
    };
    // The INTERFACE promises not to throw; a store that breaks the promise
    // is a broken store. What is asserted is that the web implementation
    // keeps it — see below — and that readJson survives a thrower.
    installKv(hostile);
    expect(() => readJson("k", (v): v is number => typeof v === "number", 7)).toThrow();
    // ^ readJson cannot defend against a store that violates its contract,
    // and pretending otherwise would hide a real bug. The defence is that
    // webKv does not violate it.
  });
});

describe("the web store keeps the never-throws promise", () => {
  beforeEach(() => {
    installKv(webKv);
    localStorage.clear();
  });

  it("round-trips a value", () => {
    webKv.set("t", "1");
    expect(webKv.get("t")).toBe("1");
    webKv.remove("t");
    expect(webKv.get("t")).toBe(null);
  });

  it("returns null rather than throwing when reading is refused", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: site data blocked");
    });
    expect(() => webKv.get("t")).not.toThrow();
    expect(webKv.get("t")).toBe(null);
    spy.mockRestore();
  });

  it("and does nothing rather than throwing when writing is refused", () => {
    // A full quota, which is a real thing on a phone with a long chat
    // history. The feature carries on without remembering.
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => webKv.set("t", "1")).not.toThrow();
    spy.mockRestore();
  });

  it("and removing is just as safe", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => webKv.remove("t")).not.toThrow();
    spy.mockRestore();
  });

  /**
   * No localStorage at all, as on the server.
   *
   * This asserts the OUTCOME, which is all that can be asserted: the store
   * reads as empty and nothing throws. It deliberately does not assert the
   * `typeof` guard, because mutation checking showed removing that guard
   * changes nothing observable — the try/catch catches the ReferenceError
   * and returns null just the same.
   *
   * So the guard stays for cost rather than correctness, and this test
   * cannot distinguish the two. Said plainly here rather than left as a
   * mutation that looks like a coverage gap: the gap is not closeable,
   * because there is nothing different to observe.
   */
  it("survives there being no localStorage at all, as on the server", () => {
    vi.stubGlobal("localStorage", undefined);
    try {
      expect(typeof localStorage).toBe("undefined");
      expect(() => webKv.get("t")).not.toThrow();
      expect(webKv.get("t")).toBe(null);
      expect(() => webKv.set("t", "1")).not.toThrow();
      expect(() => webKv.remove("t")).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("before a store is installed", () => {
  beforeEach(() => resetKv());

  it("nothing is remembered, rather than remembered until a reload", () => {
    /*
     * The failure mode the design note named: "a mutable global store with
     * a memory default fails silently into data loss if the web app ever
     * misses the installation step" — it works for a session and then
     * everything is gone.
     *
     * This is the opposite and it is the one to prefer: a read straight
     * after a write returns null, so a missing installation shows up the
     * first time anybody runs the feature.
     */
    expect(kvInstalled()).toBe(false);
    kv().set("k", "v");
    expect(kv().get("k")).toBe(null);
  });

  it("and the absent store is not a memory store wearing a different name", () => {
    absentKv.set("k", "v");
    expect(absentKv.get("k")).toBe(null);
  });

  it("installing one makes it the one in use", () => {
    const mem = memoryKv();
    installKv(mem);
    expect(kvInstalled()).toBe(true);
    kv().set("k", "v");
    expect(mem.get("k")).toBe("v");
  });
});

describe("the memory store", () => {
  it("remembers within itself and nowhere else", () => {
    const a = memoryKv();
    const b = memoryKv();
    a.set("k", "v");
    expect(a.get("k")).toBe("v");
    expect(b.get("k")).toBe(null);
  });

  it("tells an absent key from one holding an empty string", () => {
    // `map.get` returns undefined for both, so this needs `has`. A key
    // holding "" is a real stored value — a caption cleared to empty, say.
    const m = memoryKv();
    m.set("k", "");
    expect(m.get("k")).toBe("");
    expect(m.get("nope")).toBe(null);
  });

  it("removes", () => {
    const m = memoryKv();
    m.set("k", "v");
    m.remove("k");
    expect(m.get("k")).toBe(null);
  });
});

describe("readJson and writeJson", () => {
  beforeEach(() => installKv(memoryKv()));

  const isNumbers = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => typeof x === "number");

  it("round-trip a value", () => {
    writeJson("k", [1, 2, 3]);
    expect(readJson("k", isNumbers, [])).toEqual([1, 2, 3]);
  });

  it("fall back on an absent key", () => {
    expect(readJson("missing", isNumbers, [9])).toEqual([9]);
  });

  it("fall back on junk rather than throwing", () => {
    kv().set("k", "{not json");
    expect(readJson("k", isNumbers, [])).toEqual([]);
  });

  it("fall back on a value of the WRONG SHAPE", () => {
    // The reason the validator is required rather than optional. Four of
    // the eleven consumers do this check; one had it and two did not. A
    // stored value from a future version must not reach the caller typed
    // as something it is not.
    kv().set("k", JSON.stringify(["a", "b"]));
    expect(readJson("k", isNumbers, [])).toEqual([]);
  });

  it("store nothing rather than throw on a value that cannot be serialised", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => writeJson("k", cyclic)).not.toThrow();
    expect(kv().get("k")).toBe(null);
  });
});

describe("the boundary this exists to respect", () => {
  it("core's half does not mention the web's storage", () => {
    // The whole reason this is an interface with an install step rather
    // than a module that just uses localStorage. core-boundary.test.ts
    // forbids the identifier; this says why it is absent.
    //
    // Comments stripped, as core-boundary.test.ts does and for the same
    // stated reason — "so prose about the DOM is not a DOM import". The
    // first version of this assertion failed on kv.ts's own doc comment,
    // which explains at length which storage it is NOT allowed to use.
    const core = read("packages/core/src/kv.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(core).not.toMatch(/\blocalStorage\b/);
    expect(core).not.toMatch(/\bsessionStorage\b/);
    expect(core).not.toMatch(/\bwindow\b/);
  });

  it("and the web's half lives in the app", () => {
    const web = read("src/lib/kv-web.ts");
    expect(web).toContain("localStorage");
    expect(web).toContain('from "@hypefy/core/kv"');
  });
});

describe("the app installs a store", () => {
  /**
   * The residual risk, made assertable.
   *
   * `absentKv` means a missing installation is visible immediately rather
   * than as data loss — but "visible when somebody runs the feature" is
   * weaker than "visible in CI". So the installation is asserted.
   */
  it("at module scope, not in an effect", () => {
    // The consumers read during render: readSpeed() returns a number
    // straight out. A store installed in an effect arrives after the first
    // read, which would get absentKv, return the fallback, and settle on it
    // — a remembered choice that looks forgotten.
    const src = read("src/components/providers/InstallKv.tsx");
    expect(src).toContain("installKv(webKv);");
    const call = src.indexOf("installKv(webKv);");
    const fn = src.indexOf("export function InstallKv");
    expect(call, "installKv is inside the component, not at module scope").toBeLessThan(fn);
    expect(src).not.toContain("useEffect");
  });

  it("from the root layout, so public routes get it too", () => {
    // The song picker and the sign-in page both reach these modules, and
    // neither goes through (app)/layout.tsx.
    const root = read("src/app/layout.tsx");
    expect(root).toContain("InstallKv");
    expect(root).toContain("<InstallKv />");
  });

  it("and the suite installs the same one the browser does", () => {
    const setup = read("tests/setup.ts");
    expect(setup).toContain("installKv(webKv)");
    // Which is what let the moved modules' own tests go unedited.
    expect(read("vitest.config.ts")).toContain("setupFiles");
  });
});

/**
 * The accounting, asserted.
 *
 * Twenty modules touched key-value storage. Eleven were pure key-value and
 * were the ones the interface was for. Where each of the twenty ended up is
 * the kind of thing that drifts silently — a module moved back, a new one
 * written against localStorage directly — so it is written down here, with
 * the reason for each group.
 */
describe("where the storage modules ended up", () => {
  /** Still reaching for localStorage directly, each for its own reason. */
  const STAYED = {
    // Not key-value at all: these use sessionStorage too, which has no
    // native equivalent — there is no "until the tab closes" on a phone.
    "src/lib/chat-media-url.ts": "sessionStorage",
    "src/lib/pending-oauth.ts": "sessionStorage",
    // Web-only by design: a one-tab nonce for the website's Google
    // redirect, and it navigates window.location.
    "src/lib/google-id-token.ts": "sessionStorage",
    "src/lib/sound.ts": "sessionStorage",
    // Reaches for the DOM or navigator as well, so it is platform code.
    "src/lib/camera.ts": "also DOM/navigator",
    "src/lib/chat-drafts.ts": "also DOM/navigator",
    "src/lib/chat-outbox.ts": "also DOM/navigator",
    // Blocked: imports @/lib/music, which imports react and uses document.
    // A genuine architectural dependency rather than an incidental one.
    "src/lib/diary.ts": "imports a React module",
    // SECRETS. Supabase access and refresh tokens, which on a phone belong
    // in the Keychain or Keystore — async, and a different interface. Also
    // the reason the report-only CSP exists.
    "src/lib/saved-accounts.ts": "holds auth tokens",
    // The web implementation itself.
    "src/lib/kv-web.ts": "is the web store",
  };

  /** Moved into core behind the Kv interface. */
  const MOVED = [
    "emoji",
    "feed-seen",
    "ghost-share",
    "hint-schedule",
    "photo-filters",
    "recent-searches",
    "shots-seen",
    "spotlight-nudge",
    "voice-speed",
  ];

  it("nine of the eleven pure ones are in core", () => {
    for (const m of MOVED) {
      expect(
        existsSync(`packages/core/src/${m}.ts`),
        `${m} is not in core`,
      ).toBe(true);
    }
    expect(MOVED).toHaveLength(9);
  });

  it("and each left a shim, so no caller had to change", () => {
    for (const m of MOVED) {
      const shim = read(`src/lib/${m}.ts`);
      expect(shim, `${m}'s old path is not a shim`).toContain(
        `export * from "@hypefy/core/${m}"`,
      );
    }
  });

  it("the ones that stayed are exactly the ones with a reason", () => {
    // Not a maximum: an exact set. A new module written straight against
    // localStorage fails here, and so does one of these moving without the
    // reasoning above being updated.
    const using = readdirSync("src/lib")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /\blocalStorage\b/.test(read(`src/lib/${f}`)))
      .map((f) => `src/lib/${f}`)
      .sort();
    expect(using).toEqual(Object.keys(STAYED).sort());
  });

  it("nothing in core reaches for it, which is the point", () => {
    const offenders = readdirSync("packages/core/src")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) =>
        /\b(local|session)Storage\b/.test(
          read(`packages/core/src/${f}`)
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1"),
        ),
      );
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});
