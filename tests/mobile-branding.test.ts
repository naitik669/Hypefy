import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { colors } from "@hypefy/tokens";
import appConfig, {
  googleServicesFile,
  withGoogleServices,
  GOOGLE_SERVICES_FALLBACK,
} from "../apps/mobile/app.config";

/**
 * What a Play build needs that code cannot show: push config, a launcher
 * icon, a splash.
 *
 * - **Push.** The app registers a native FCM token (src/notifications/push.ts)
 *   and that call rejects in a build with no google-services.json. The file
 *   is an EAS "file" variable, GOOGLE_SERVICES_JSON, whose value at build
 *   time is a path; app.config.ts is what hands that path to Expo. Driven
 *   here, not read.
 * - **Icon and splash.** Without them the launcher shows Expo's default.
 *   They are the web's own artwork: resources/ is the source the site's
 *   /icons/*.png were generated from, so the app's copies are asserted
 *   byte-identical to it rather than "looks right".
 */

const MOBILE = "apps/mobile";
type Json = Record<string, unknown>;
const appJson = () =>
  JSON.parse(readFileSync(`${MOBILE}/app.json`, "utf8")) as {
    expo: Json & {
      icon?: string;
      android: Json & { adaptiveIcon?: { foregroundImage?: string; backgroundColor?: string } };
      plugins: (string | [string, Json])[];
    };
  };

/** A config path ("./assets/x.png") as a repo path. */
const asset = (p: string) => `${MOBILE}/${p.replace(/^\.\//, "")}`;

/** Width, height and PNG colour type from the IHDR chunk. */
function png(path: string) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString("latin1"), `${path} is not a PNG`).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}

function splash(): Json {
  const entry = appJson().expo.plugins.find(
    (p): p is [string, Json] => Array.isArray(p) && p[0] === "expo-splash-screen",
  );
  expect(entry, "expo-splash-screen is not configured").toBeTruthy();
  return entry![1];
}

describe("google-services.json comes from the EAS file variable", () => {
  it("uses the path EAS puts in GOOGLE_SERVICES_JSON", () => {
    expect(googleServicesFile({ GOOGLE_SERVICES_JSON: "/tmp/eas/abc/google-services.json" })).toBe(
      "/tmp/eas/abc/google-services.json",
    );
  });

  it("falls back to the gitignored local copy when the variable is absent or empty", () => {
    expect(googleServicesFile({})).toBe("./google-services.json");
    expect(googleServicesFile({ GOOGLE_SERVICES_JSON: "" })).toBe("./google-services.json");
  });

  it("the default export sets it on the real app.json without losing anything", () => {
    const before = appJson().expo;
    const prev = process.env.GOOGLE_SERVICES_JSON;
    process.env.GOOGLE_SERVICES_JSON = "/eas/gs.json";
    try {
      const out = appConfig({ config: before } as unknown as Parameters<typeof appConfig>[0]);
      expect(out.android?.googleServicesFile).toBe("/eas/gs.json");
      // Spreading must keep every android key app.json sets.
      expect(out.android?.package).toBe("chat.hypefy.app");
      expect(out.android?.adaptiveIcon).toEqual(before.android.adaptiveIcon);
      expect(out.plugins).toEqual(before.plugins);
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_SERVICES_JSON;
      else process.env.GOOGLE_SERVICES_JSON = prev;
    }
  });

  it("withGoogleServices does not mutate the config it is given", () => {
    const config = { name: "x", slug: "x", android: { package: "p" } };
    withGoogleServices(config, { GOOGLE_SERVICES_JSON: "/a" });
    expect(config.android).toEqual({ package: "p" });
  });

  it("the local fallback can never be committed", () => {
    const fallback = asset(GOOGLE_SERVICES_FALLBACK);
    // check-ignore exits 1 (and execFileSync throws) when the path is NOT ignored.
    const ignored = execFileSync("git", ["check-ignore", "--no-index", fallback], {
      encoding: "utf8",
    }).trim();
    expect(ignored).toBe(fallback);
    const tracked = execFileSync("git", ["ls-files", "--", MOBILE], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith("google-services.json"));
    expect(tracked).toEqual([]);
  });
});

describe("the icon and splash are the web's own artwork", () => {
  it("icon: 1024 square, byte-identical to the web icon source", () => {
    const icon = appJson().expo.icon;
    expect(icon, "app.json has no icon").toBeTruthy();
    const path = asset(icon!);
    expect(png(path)).toMatchObject({ w: 1024, h: 1024 });
    expect(readFileSync(path).equals(readFileSync("resources/icon.png"))).toBe(true);
  });

  it("adaptive icon: the transparent mark on the icon's black", () => {
    const adaptive = appJson().expo.android.adaptiveIcon;
    expect(adaptive?.foregroundImage, "no adaptive icon").toBeTruthy();
    const path = asset(adaptive!.foregroundImage!);
    // Colour type 6 = RGBA: the foreground must be transparent around the mark.
    expect(png(path)).toEqual({ w: 1024, h: 1024, colorType: 6 });
    expect(readFileSync(path).equals(readFileSync("resources/icon-foreground.png"))).toBe(true);
    expect(adaptive!.backgroundColor).toBe("#000000");
  });

  it("splash: the mark on the app's background colour", () => {
    const s = splash();
    expect(typeof s.image).toBe("string");
    expect(existsSync(asset(s.image as string)), `${s.image} is missing`).toBe(true);
    expect(readFileSync(asset(s.image as string)).equals(readFileSync("resources/icon-foreground.png"))).toBe(
      true,
    );
    // The colour the first screen paints, so the splash hands over without a flash.
    expect(s.backgroundColor).toBe(colors.background);
    expect(s.backgroundColor).toBe("#0a0a0a");
  });

  it("expo-splash-screen is a dependency, not only a plugin name", () => {
    const pkg = JSON.parse(readFileSync(`${MOBILE}/package.json`, "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["expo-splash-screen"]).toBeTruthy();
  });
});
