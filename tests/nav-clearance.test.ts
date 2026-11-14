import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The share button sat under the bottom bar.
 *
 * Scrolling the home feed, the last card's action row — hype, comment,
 * share, save — ran under the nav bar instead of stopping clear of it.
 *
 * Two numbers that had to agree and didn't. The bar is 72px tall PLUS the
 * gesture-bar inset it pads itself by, so on this phone it stands about
 * 96px; the scrolling content reserved a flat 84px. The difference is the
 * inset, which is 0 on a desktop browser and 0 in the simulator chrome most
 * of this was looked at in — so it read as fine everywhere except a real
 * phone, which is where it was reported.
 *
 * Now --nav-h is the bar's height and --nav-space is what content leaves
 * clear: the bar, the inset, and 12px of air so the row is clear of the bar
 * rather than flush against it. The bar wears one, every scroll container
 * reserves the other.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const css = read("src/app/globals.css");

function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("room under the bottom bar", () => {
  it("the bar's height and the room for it are declared once", () => {
    expect(css).toContain("--nav-h: 72px;");
    expect(css).toContain("--nav-space: calc(var(--nav-h) + var(--sab) + 12px);");
  });

  it("and the room counts the inset the bar pads itself by", () => {
    // The whole bug: 84px was the bar's height plus air and no inset, so it
    // came up short by exactly the gesture bar on every phone that has one.
    const space = css.match(/--nav-space:\s*calc\(([^;]+)\);/)?.[1] ?? "";
    expect(space).toContain("var(--nav-h)");
    expect(space).toContain("var(--sab)");
  });

  it("the bar wears the height rather than repeating it", () => {
    const nav = read("src/components/layout/BottomNav.tsx");
    expect(nav).toContain("h-[var(--nav-h)]");
    expect(nav).not.toMatch(/h-\[72px\]/);
  });

  it("and nothing positions itself off a hardcoded bar height either", () => {
    // ShotUploadCard sat at bottom-[calc(72px+var(--sab))] — the same two
    // numbers that had to agree, disagreeing in a second place. The padding
    // sweep below could not see it, because it is a position and not a pad.
    const offenders = sourceFiles()
      .filter((f) => /(bottom|top|height|h)-\[calc\(\s*72px/.test(read(f)))
      .map((f) => f.split("\\").join("/"));
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("and nothing reserves a flat number of its own", () => {
    // A hard-coded pad is the thing that drifted. Only nav-sized ones: a
    // card padding its own 11px is not clearing the bar, and sweeping those
    // in made this fail on IntroFinale, which has nothing to do with it.
    const NAV_ISH = 60;
    const offenders = sourceFiles()
      .filter((f) =>
        [...read(f).matchAll(/pb-\[(\d+)px\]/g)].some((m) => Number(m[1]) >= NAV_ISH)
      )
      .map((f) => f.split("\\").join("/"));
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("the scroll containers reserve it", () => {
    for (const f of ["src/app/(app)/layout.tsx", "src/components/layout/SwipeNav.tsx"]) {
      expect(read(f), f).toContain("pb-[var(--nav-space)]");
    }
  });
});
