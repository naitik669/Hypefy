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

/** Every .ts under a directory, including subdirectories. */
function walk(dir: string, base = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) return walk(`${dir}/${e.name}`, rel);
    return e.name.endsWith(".ts") ? [rel] : [];
  });
}

// Recursive on purpose. It was a flat readdir until core gained
// supabase/ and billing/ subdirectories, at which point the shims inside them
// were silently unchecked — including supabase/database.types, which the
// Supabase CLI REGENERATES to its old path. A regeneration landing on top of
// a shim would restore a second, stale copy of the types with nothing to say
// so; now it fails the "shims carry no logic" check below.
const files = (): string[] => walk(CORE);

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
    // `\bwindow\b` and not `\bwindow\.`, which is what this was. A core
    // module carrying `typeof window === "undefined"` — the guard every one
    // of the key-value modules had before the Kv interface took it over —
    // has no dot after window, and sailed straight past. That guard is
    // precisely the thing a platform-free module should not need.
    ["window", /\bwindow\b/],
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
  /*
   * Driven from what is IN CORE, not from what still looks like a shim.
   *
   * The first version of this listed src/lib files whose contents matched
   * `export * from "@hypefy/core/`, which cannot detect the failure that
   * matters: a shim that stops being a shim simply drops out of the list
   * instead of failing. Overwriting supabase/database.types.ts with a
   * regenerated copy — the exact hazard, since the Supabase CLI writes to
   * that old path — left the suite green.
   *
   * So: for every module in core, if the old path still exists, it must be
   * a one-line re-export pointing at that same module. A module with no old
   * path is fine; that is either one born in core or a shim already retired.
   */
  const oldPathOf = (m: string) => `${SHIM_DIR}/${m}.ts`;

  it("point at the module they claim, and only that", () => {
    const checked: string[] = [];
    for (const rel of files()) {
      const m = rel.replace(/.ts$/, "");
      const old = oldPathOf(m);
      if (!existsSync(old)) continue;
      checked.push(m);
      expect(code(old).trim(), `${old} should re-export @hypefy/core/${m}`).toBe(
        `export * from "@hypefy/core/${m}";`,
      );
    }
    // A boundary test over nothing passes and proves nothing.
    expect(checked.length).toBeGreaterThan(0);
  });

  it("and nothing in src/lib forwards to a module that is not there", () => {
    for (const rel of walk(SHIM_DIR)) {
      const target = read(`${SHIM_DIR}/${rel}`).match(
        /export \* from "@hypefy\/core\/([a-z0-9\/.-]+)"/,
      )?.[1];
      if (!target) continue;
      expect(
        existsSync(`${CORE}/${target}.ts`),
        `${rel} forwards to @hypefy/core/${target}, which does not exist`,
      ).toBe(true);
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
