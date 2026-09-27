import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards on the Android resource XML that only the release build reads.
 *
 * Both of these went unnoticed for eleven days and forty consecutive red
 * Android builds, because nothing on the web side touches these files and
 * `next build` never opens them. The cost of checking here is a few
 * milliseconds; the cost of not checking was every release APK in that
 * window.
 */

const RES = "android/app/src/main/res";

function xmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return xmlFiles(path);
    return name.endsWith(".xml") ? [path] : [];
  });
}

describe("android resource xml", () => {
  it("has resource files to check", () => {
    // If this ever reads zero, the two tests below pass without testing
    // anything — which is how a guard quietly stops guarding.
    expect(xmlFiles(RES).length).toBeGreaterThan(0);
  });

  it("never puts a double hyphen inside a comment", () => {
    // XML forbids "--" in a comment body. aapt2 enforces it at
    // mergeReleaseResources, so it passes lint, passes the web build, and
    // fails only when someone tries to ship an APK.
    const offenders = xmlFiles(RES).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(/<!--([\s\S]*?)-->/g)]
        .filter((m) => m[1].includes("--"))
        .map((m) => `${file}:${text.slice(0, m.index).split("\n").length}`);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps the launch colour the same as the web background", () => {
    // The launch screen, the status bar and the first painted page are meant
    // to be one colour with no seam. Three files have to agree for that, and
    // nothing else would notice if one drifted.
    const android = readFileSync(join(RES, "values/colors.xml"), "utf8").match(
      /<color name="hypefy_black">(#[0-9a-fA-F]{6})<\/color>/,
    );
    const css = readFileSync("src/app/globals.css", "utf8").match(
      /--color-background:\s*(#[0-9a-fA-F]{6})/,
    );
    const manifest = readFileSync("src/app/manifest.ts", "utf8").match(
      /theme_color:\s*"(#[0-9a-fA-F]{6})"/,
    );

    expect(android?.[1]).toBeDefined();
    expect(css?.[1]).toBeDefined();
    expect(manifest?.[1]).toBeDefined();
    expect(android![1].toLowerCase()).toBe(css![1].toLowerCase());
    expect(manifest![1].toLowerCase()).toBe(css![1].toLowerCase());
  });
});
