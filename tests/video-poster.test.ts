import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every <video> sets a poster. Without one, Android's WebView paints its own
 * grey play-button placeholder while the first frame loads, which is what
 * showed on Shots tiles before they loaded (see src/lib/blank-poster.ts).
 */

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** The opening tag starting at `at`, skipping braces and quotes. */
function openingTag(src: string, at: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = at + 6; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (depth === 0 && (c === '"' || c === "'" || c === "`")) { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
}

describe("video posters", () => {
  it("no <video> in the app is left without a poster", () => {
    const missing: string[] = [];
    for (const file of tsxFiles("src")) {
      const src = readFileSync(file, "utf8");
      let at = src.indexOf("<video");
      while (at >= 0) {
        if (/\s/.test(src[at + 6]) && !openingTag(src, at).includes("poster=")) {
          missing.push(`${file}:${src.slice(0, at).split("\n").length}`);
        }
        at = src.indexOf("<video", at + 6);
      }
    }
    expect(missing).toEqual([]);
  });
});
