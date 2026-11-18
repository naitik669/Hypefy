import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { colors, radii, fonts, weights } from "@hypefy/tokens";
import { NATIVE_AUTH_REDIRECT } from "@hypefy/core/native-auth-link";

/**
 * The native client's foundation, from the web's test runner.
 *
 * Read as source rather than imported, because these modules import
 * react-native and expo-* — none of which exist in a jsdom environment. The
 * things worth asserting here are structural anyway: that the app takes its
 * colours from the tokens instead of carrying its own, that no font weight
 * points at a file that is not bundled, and that the deep-link scheme
 * matches the one the web already hands out.
 *
 * What this canNOT tell you: whether any of it runs. Nothing in apps/mobile
 * has run on a device. It typechecks under TypeScript 6 and it bundles —
 * verified by `expo export`, which produced a 3.2MB Hermes bundle
 * containing the accent colour, the font family names and the chunking
 * module — and that is the honest extent of it.
 */

const read = (p: string) => readFileSync(p, "utf8");
const theme = read("apps/mobile/src/theme.ts");
const fontsModule = read("apps/mobile/src/fonts.ts");
const appJson = JSON.parse(read("apps/mobile/app.json")) as {
  expo: Record<string, unknown> & {
    android?: Record<string, unknown>;
    ios?: Record<string, unknown>;
    plugins?: string[];
  };
};

describe("the native theme comes from the tokens", () => {
  it("imports them rather than restating them", () => {
    expect(theme).toContain('from "@hypefy/tokens"');
  });

  it("carries no colour of its own", () => {
    /*
     * The whole point of @hypefy/tokens. A hex literal here is a second
     * copy of the palette, and two copies is how the app and the website
     * end up almost the same shade of lime.
     *
     * Comments stripped first — the fourth time in this project that a
     * comment has satisfied an assertion meant to read code, so it is the
     * default now rather than an afterthought.
     */
    const code = theme
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes, `hard-coded colours: ${hexes.join(", ")}`).toEqual([]);
  });

  it("and the screens take theirs from the theme, not from hex", () => {
    for (const f of ["apps/mobile/app/index.tsx", "apps/mobile/app/_layout.tsx"]) {
      const code = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hexes, `${f} has hard-coded colours: ${hexes.join(", ")}`).toEqual([]);
    }
  });

  it("re-exports the palette unchanged, so a screen cannot drift", () => {
    expect(theme).toContain("export const palette = colors;");
  });

  it("takes the radii from the tokens too", () => {
    expect(theme).toContain("export const radius = radii;");
    // And the figures are the ones the stylesheet uses, asserted in
    // tests/tokens.test.ts in both directions.
    expect(radii.pill).toBeGreaterThanOrEqual(100);
  });

  it("and navSpace, so both clients leave the same room for the bar", () => {
    // The same function, given the device's own inset: env(safe-area-inset-
    // bottom) on the web, react-native-safe-area-context here.
    expect(theme).toContain('export { navSpace } from "@hypefy/tokens"');
  });
});

describe("the fonts", () => {
  it("map every CSS weight the web uses", () => {
    // If the web starts using a seventh weight, tokens' own test fails
    // first; this one fails if the native map has not followed.
    for (const name of Object.keys(weights)) {
      expect(theme, `no family for font-${name}`).toMatch(
        new RegExp(`^\\s*${name}:\\s*"PlusJakartaSans-`, "m"),
      );
    }
  });

  it("and every family named is one that is actually bundled", () => {
    /*
     * The failure this prevents is silent: a family name React Native has
     * not been given renders in the system face, with no error anywhere. It
     * looks like a font that did not load rather than a name that was never
     * registered.
     */
    const named = [...theme.matchAll(/^\s*\w+:\s*"(PlusJakartaSans-[A-Za-z]+)"/gm)].map(
      (m) => m[1],
    );
    expect(named.length).toBeGreaterThanOrEqual(Object.keys(weights).length);
    for (const family of new Set(named)) {
      expect(fontsModule, `${family} is not in fonts.ts`).toContain(`"${family}"`);
    }
  });

  it("and every bundled file exists on disk", () => {
    // A missing .ttf is a Metro BUNDLING error, not a runtime one — the app
    // would not start at all, which is why the three absent weights are
    // deliberately not referenced.
    const files = [...fontsModule.matchAll(/assets\/fonts\/([A-Za-z0-9.-]+\.ttf)/g)].map(
      (m) => m[1],
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(existsSync(`apps/mobile/assets/fonts/${f}`), `${f} is missing`).toBe(true);
    }
  });

  it("ships the licence beside them, as the OFL requires", () => {
    expect(existsSync("apps/mobile/assets/fonts/OFL.txt")).toBe(true);
  });

  it("names the family the tokens name", () => {
    expect(theme).toContain("export const fontFamilyName = fonts.sans;");
    expect(fonts.sans).toBe("Plus Jakarta Sans");
  });
});

describe("app.json", () => {
  it("uses the deep-link scheme the web already hands out", () => {
    /*
     * The one the Phase 0 audit found wrong in the Capacitor app:
     * strings.xml said chat.hypefy.app while the manifest and
     * native-auth-link.ts said chat.hypefy. A scheme that does not match
     * means the OAuth redirect lands nowhere and sign-in hangs with no
     * error — so it is derived from the constant rather than retyped.
     */
    const expected = new URL(NATIVE_AUTH_REDIRECT).protocol.replace(":", "");
    expect(appJson.expo.scheme).toBe(expected);
    expect(appJson.expo.scheme).toBe("chat.hypefy");
  });

  it("keeps the application id the Play listing already has", () => {
    // Changing this is a new app listing, not an update.
    expect(appJson.expo.android?.package).toBe("chat.hypefy.app");
  });

  it("is dark-only and does not allow a device backup of app data", () => {
    // allowBackup="false" is deliberate in the Capacitor app and the
    // reasoning carries over: this app's storage holds a session.
    expect(appJson.expo.userInterfaceStyle).toBe("dark");
    expect(appJson.expo.android?.allowBackup).toBe(false);
  });

  it("is on the New Architecture, which the SDK requires anyway", () => {
    expect(appJson.expo.newArchEnabled).toBe(true);
  });

  it("declares the plugins the app actually uses", () => {
    for (const p of ["expo-router", "expo-secure-store", "expo-font"]) {
      expect(appJson.expo.plugins, `${p} is not declared`).toContain(p);
    }
  });
});

describe("the session store", () => {
  const store = read("apps/mobile/src/session-store.ts");

  /** Comments stripped. See below for why this is not optional. */
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("uses the Keychain, never AsyncStorage", () => {
    // AsyncStorage is a plain file. This holds a refresh token, which is a
    // durable credential.
    //
    // Against the code, not the file: session-store.ts's own doc comment
    // explains that it uses the Keychain "never AsyncStorage", and the
    // first version of this assertion failed on that sentence. Fifth time
    // in this project — and in the same file where I had just written that
    // stripping comments should be the default rather than an afterthought.
    expect(store).toContain('from "expo-secure-store"');
    expect(code(store)).not.toContain("AsyncStorage");
  });

  it("goes through the chunking rather than writing the session whole", () => {
    // A Google session is ~2.4KB against secure-store's 2048 ceiling,
    // because Supabase keeps the provider's tokens on it. Written whole it
    // silently fails to persist and the app signs that user out on every
    // launch.
    expect(store).toContain('from "@hypefy/core/chunked-store"');
    /*
     * CALLED, not merely imported.
     *
     * This asserted `toContain("splitValue")`, and the import line satisfies
     * that on its own — so replacing the call with `const parts = [value]`,
     * which writes the session whole and is exactly the bug the chunking
     * exists to prevent, left the test green. Mutation checking found it.
     */
    const body = code(store);
    expect(body).toMatch(/splitValue\(\s*value/);
    expect(body).toMatch(/joinChunks\(\s*parts/);
    // And the limit is the shared one rather than a number retyped here.
    expect(body).toContain("CHUNK_LIMIT");
  });

  it("writes the count last and removes it last", () => {
    // Ordering is the whole crash-safety story: a count written before its
    // parts names parts that do not exist, and parts removed after their
    // count leaves orphans nothing will clean up.
    const set = store.slice(store.indexOf("async setItem"), store.indexOf("async removeItem"));
    expect(set.indexOf("setItemAsync(chunkKey")).toBeLessThan(
      set.indexOf("setItemAsync(k, String(parts.length))"),
    );
    expect(store).toContain("keysToRemove");
  });

  it("and the client keeps refreshing, because rotation is on", () => {
    // Measured on this project: 1,389 tokens across 114 sessions, each
    // refresh revoking its predecessor. Without autoRefreshToken the
    // stored token goes stale and the next launch signs the user out.
    const client = read("apps/mobile/src/supabase.ts");
    expect(client).toContain("autoRefreshToken: true");
    expect(client).toContain("persistSession: true");
    // There is no URL bar on a phone; the redirect arrives as a deep link.
    expect(client).toContain("detectSessionInUrl: false");
    expect(client).toContain("storage: secureSessionStore");
  });

  it("polyfills URL before the client is built", () => {
    // Hermes ships an incomplete URL and supabase-js builds request URLs
    // with it, so the import has to land above everything else.
    const client = read("apps/mobile/src/supabase.ts");
    expect(client.trimStart().startsWith('import "react-native-url-polyfill/auto";')).toBe(true);
  });
});

describe("the monorepo wiring", () => {
  it("Metro is told to watch the workspace, not just this folder", () => {
    const metro = read("apps/mobile/metro.config.js");
    expect(metro).toContain("config.watchFolders = [workspaceRoot]");
    // And to look here first: this app pins react 19.3.0 while the web is
    // on 19.2.4, so resolving react from the root would hand React Native
    // the wrong one.
    expect(metro).toContain("config.resolver.nodeModulesPaths");
    const order = metro.slice(metro.indexOf("nodeModulesPaths"));
    expect(order.indexOf("projectRoot")).toBeLessThan(order.indexOf("workspaceRoot"));
  });

  it("the root tsconfig does not try to typecheck it", () => {
    // The web is on TypeScript 5.9 and this app on 6.0. One tsc reading
    // both would be the web's, on code written for the other.
    const root = JSON.parse(read("tsconfig.json")) as { exclude: string[] };
    expect(root.exclude).toContain("apps/**");
  });

  it("and nested node_modules are ignored", () => {
    // `/node_modules` is rooted, so the copies npm nests for a workspace
    // with a conflicting version were not covered. Without this a
    // `git add -A` commits about 1,100 packages.
    const ignore = read(".gitignore");
    expect(ignore).toMatch(/^node_modules\/$/m);
  });

  it("the app is a workspace, so @hypefy/core resolves as a package", () => {
    const root = JSON.parse(read("package.json")) as { workspaces: string[] };
    expect(root.workspaces).toContain("apps/*");
    const mobile = JSON.parse(read("apps/mobile/package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(mobile.dependencies["@hypefy/core"]).toBeTruthy();
    expect(mobile.dependencies["@hypefy/tokens"]).toBeTruthy();
  });

  it("and pins its own react, because react-native needs a newer one", () => {
    const mobile = JSON.parse(read("apps/mobile/package.json")) as {
      dependencies: Record<string, string>;
    };
    // react-native 0.88 peers on ^19.3; the web is on 19.2.4. npm nests
    // this one, which works only because packages/core forbids react —
    // nothing shared depends on a react version. core-boundary enforces it.
    expect(mobile.dependencies.react).toBe("19.3.0");
    expect(mobile.dependencies["react-native"]).toBe("0.88.1");
  });
});

describe("comments that cite a test cite one that exists", () => {
  it("every tests/… path named in the mobile source is a real file", () => {
    /*
     * fonts.ts claimed its guarantee was held by `tests/mobile-theme.ts`,
     * which has never existed. The guarantee was real and lives in this
     * file; the pointer was not. That is a quiet kind of wrong: it reads
     * as evidence, it survives review, and the only way to find it is to
     * go looking.
     *
     * Cheap to prevent, so prevented. This is the inverse of the trap
     * that keeps appearing in this repo — there, a comment satisfied an
     * assertion meant to read code; here, a comment asserts something
     * about the test suite and nothing checked it back.
     */
    const files = readdirSync("apps/mobile/src")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => `apps/mobile/src/${f}`);
    expect(files.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const file of files) {
      for (const m of read(file).matchAll(/tests\/[\w.-]+\.test\.tsx?/g)) {
        if (!existsSync(m[0])) missing.push(`${file} cites ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("the config an EAS build has to carry", () => {
  /**
   * supabase.ts throws at module scope when the Supabase values are absent,
   * deliberately — an opaque network error on the sign-in screen is worse
   * than a loud startup failure. The cost of that choice is that a build
   * profile missing them produces an app which installs and then dies on
   * launch, and the round trip to find out is a full EAS build.
   *
   * So the two are tied together here: whatever the app reads from
   * EXPO_PUBLIC_*, every profile must supply.
   */
  const easPath = "apps/mobile/eas.json";

  /** Every EXPO_PUBLIC_ name the mobile source actually reads. */
  function referencedNames(): string[] {
    const files = [
      "apps/mobile/src/supabase.ts",
      "apps/mobile/src/session-store.ts",
      "apps/mobile/src/theme.ts",
      "apps/mobile/src/fonts.ts",
      "apps/mobile/app/_layout.tsx",
      "apps/mobile/app/index.tsx",
    ];
    const found = new Set<string>();
    for (const f of files) {
      // Comments stripped first. A doc comment naming the variable has
      // satisfied this kind of scan five times in this repo already.
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const m of src.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) {
        found.add(m[1]);
      }
    }
    return [...found].sort();
  }

  it("the app reads the two Supabase values and nothing else", () => {
    expect(referencedNames()).toEqual([
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
      "EXPO_PUBLIC_SUPABASE_URL",
    ]);
  });

  it("and every build profile supplies all of them", () => {
    const eas = JSON.parse(read(easPath)) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    const profiles = Object.keys(eas.build);
    expect(profiles.length).toBeGreaterThan(0);

    for (const name of profiles) {
      const env = eas.build[name].env ?? {};
      for (const key of referencedNames()) {
        expect(env[key], `${name} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it("the url points at this project and the key is the anon one", () => {
    const eas = JSON.parse(read(easPath)) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    for (const [name, profile] of Object.entries(eas.build)) {
      const env = profile.env ?? {};
      expect(env.EXPO_PUBLIC_SUPABASE_URL, name).toMatch(
        /^https:\/\/[a-z0-9]+\.supabase\.co$/,
      );
      // The anon key is public by design and bounded by RLS — the web
      // already inlines it into every page. The service-role key bypasses
      // RLS entirely and must never reach a device.
      expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY, name).toMatch(/^eyJ/);
      expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY, name).not.toMatch(/service_role/);
    }
  });

  it("over-the-air updates are pinned to the app version", () => {
    /*
     * expo-updates ships JS to installed apps without a store round trip,
     * which is the difference between a one-minute fix and an hour-long
     * rebuild. The hazard is serving an update to a binary that cannot run
     * it: an OTA carries JS only, so any change to native code — a new
     * module, a permission, a config plugin — needs a real build.
     *
     * `runtimeVersion.policy: "appVersion"` is what enforces that. The
     * runtime version is derived from `version`, so a binary only accepts
     * updates built against the same one, and bumping `version` for a
     * native change cuts the old binaries off rather than feeding them JS
     * they cannot execute.
     */
    const app = JSON.parse(read("apps/mobile/app.json")) as {
      expo: {
        version: string;
        runtimeVersion?: { policy?: string };
        updates?: { url?: string };
        extra?: { eas?: { projectId?: string } };
      };
    };
    expect(app.expo.runtimeVersion?.policy).toBe("appVersion");
    expect(app.expo.version).toBeTruthy();

    // The update URL must name THIS project. Pointing at another one
    // would serve someone else's JS to these devices.
    const projectId = app.expo.extra?.eas?.projectId;
    expect(projectId).toBeTruthy();
    expect(app.expo.updates?.url).toBe(`https://u.expo.dev/${projectId}`);
  });

  it("and every build profile names a channel, or it cannot be updated", () => {
    // A profile with no channel produces a binary no `eas update` can
    // reach — it would silently never receive a fix.
    const eas = JSON.parse(read("apps/mobile/eas.json")) as {
      build: Record<string, { channel?: string; developmentClient?: boolean }>;
    };
    for (const [name, profile] of Object.entries(eas.build)) {
      // The development profile runs a dev client off a local server and
      // has nothing to update.
      if (profile.developmentClient) continue;
      expect(profile.channel, `${name} has no channel`).toBeTruthy();
    }
  });

  it("and no profile smuggles a server-only secret", () => {
    // A build profile's env is baked into the binary, which is readable.
    const raw = read(easPath);
    for (const forbidden of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "FCM_SERVICE_ACCOUNT",
      "RAZORPAY",
      "PRIVATE KEY",
      "KEYSTORE_PASSWORD",
    ]) {
      expect(raw, `${forbidden} must not be in eas.json`).not.toContain(forbidden);
    }
  });
});

describe("what the tokens guarantee for both clients", () => {
  it("one accent, one background", () => {
    // Sanity that the import above is the real tokens module and not a
    // stub — every assertion in this file leans on it.
    expect(colors.accent).toBe("#a3e635");
    expect(colors.background).toBe("#0a0a0a");
  });
});
