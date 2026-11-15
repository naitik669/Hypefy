import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";

/**
 * What packages/core is allowed to depend on.
 *
 * The point of the package is that a second consumer — the Expo app, from
 * Phase 5 — can import it unchanged. That property is not created by moving
 * files into a folder; it is created by something refusing the import that
 * would break it. Without this test, the first `document.querySelector` added
 * to a "shared" module would be found in Phase 5, by which time a dozen more
 * would have followed it.
 *
 * So the boundary is checked here rather than trusted. React Native has no
 * DOM, no `document`, no `localStorage`, no `crypto.subtle`, no Capacitor and
 * no Next; a module in core that reaches for any of them is not shared code,
 * whatever directory it sits in.
 *
 * Deliberately NOT forbidden: @supabase/supabase-js (it runs in React Native)
 * and `fetch` (it exists on both).
 */

const CORE = "packages/core/src";
const SHIM_DIR = "src/lib";

const files = (): string[] =>
  existsSync(CORE) ? readdirSync(CORE).filter((f) => f.endsWith(".ts")) : [];

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Source with comments stripped, so prose about the DOM is not a DOM import. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("packages/core is importable from React Native", () => {
  it("has modules in it at all", () => {
    // A boundary test over an empty directory passes and proves nothing, which
    // is how this file would quietly stop meaning anything.
    expect(files().length).toBeGreaterThan(0);
  });

  const FORBIDDEN_IMPORTS: [string, RegExp][] = [
    ["react", /from "react(-dom)?"/],
    ["next", /from "next\//],
    ["server-only", /from "server-only"/],
    ["Capacitor", /from "@capacitor\//],
    ["node builtins", /from "node:|from "(fs|path|crypto|os|child_process)"/],
    ["sharp", /from "sharp"/],
    ["the app itself", /from "@\//],
  ];

  for (const [label, pattern] of FORBIDDEN_IMPORTS) {
    it(`imports nothing from ${label}`, () => {
      const bad = files().filter((f) => pattern.test(code(`${CORE}/${f}`)));
      expect(bad, `these import ${label}`).toEqual([]);
    });
  }

  const FORBIDDEN_GLOBALS: [string, RegExp][] = [
    ["document", /\bdocument\./],
    ["window", /\bwindow\./],
    ["localStorage or sessionStorage", /\b(local|session)Storage\b/],
    ["navigator", /\bnavigator\./],
    ["indexedDB", /\bindexedDB\b/],
    ["WebCrypto subtle", /crypto\.subtle/],
    ["canvas", /getContext\(|createElement\(/],
    ["media capture", /MediaRecorder|mediaDevices/],
    ["DOM types", /\bHTML[A-Za-z]*Element\b/],
  ];

  for (const [label, pattern] of FORBIDDEN_GLOBALS) {
    it(`does not reach for ${label}`, () => {
      const bad = files().filter((f) => pattern.test(code(`${CORE}/${f}`)));
      expect(bad, `these use ${label}`).toEqual([]);
    });
  }
});

describe("the re-exports left behind at the old paths", () => {
  /** Shims: a src/lib file whose whole job is to forward to core. */
  const shims = (): string[] =>
    readdirSync(SHIM_DIR)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /export \* from "@hypefy\/core\//.test(read(`${SHIM_DIR}/${f}`)));

  it("exist, and each points at a module that is really there", () => {
    const found = shims();
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) {
      const target = read(`${SHIM_DIR}/${f}`).match(/@hypefy\/core\/([a-z0-9-]+)/)?.[1];
      expect(target, `${f} has no target`).toBeTruthy();
      expect(
        existsSync(`${CORE}/${target}.ts`),
        `${f} forwards to @hypefy/core/${target}, which does not exist`,
      ).toBe(true);
    }
  });

  it("and carry no logic of their own", () => {
    // A shim that grows a function is a second implementation nobody knows
    // about: callers of @/lib/x and callers of @hypefy/core/x would get
    // different code.
    for (const f of shims()) {
      const body = code(`${SHIM_DIR}/${f}`).trim();
      expect(body, `${f} should be one re-export`).toMatch(
        /^export \* from "@hypefy\/core\/[a-z0-9-]+";$/,
      );
    }
  });
});

describe("the two resolvers agree", () => {
  it("tsconfig maps @hypefy/core and vitest aliases it", () => {
    // Vitest does not read tsconfig paths. They are two separate mechanisms
    // for one import, and when only one of them knows about the package the
    // failure is a module-not-found in whichever tool was forgotten.
    const ts = read("tsconfig.json");
    expect(ts).toContain('"@hypefy/core/*"');
    expect(ts).toContain("./packages/core/src/*");

    const vitest = read("vitest.config.ts");
    expect(vitest).toContain('find: "@hypefy/core"');
    expect(vitest).toContain("./packages/core/src");
  });

  it("and the alias order puts the specific one first", () => {
    // Vite takes the first `find` that matches and does not fall through, so
    // "@" listed above "@hypefy/core" would swallow every core import.
    const vitest = read("vitest.config.ts");
    expect(vitest.indexOf('find: "@hypefy/core"')).toBeLessThan(
      vitest.indexOf('find: "@"'),
    );
  });

  it("and the workspace actually includes the package", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.workspaces).toContain("packages/*");
    expect(existsSync("packages/core/package.json")).toBe(true);
  });
});
