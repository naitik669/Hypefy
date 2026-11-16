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

  it("the bar's top edge is declared once too", () => {
    // --nav-space is what a scroll container CLEARS: height, inset, and 12px
    // of air below its last row. --nav-edge is what something SITS ON: the
    // same height and inset, no air, because a save bar pinned above the nav
    // should touch it. Both zero at lg, where there is no bar.
    expect(css).toContain("--nav-edge: calc(var(--nav-h) + var(--sab));");
    const lg = css.slice(css.indexOf("@media (min-width: 1024px)"));
    expect(lg.slice(0, lg.indexOf("\n}"))).toMatch(/--nav-edge:\s*0px/);
  });

  /**
   * The bare form the test above could not see.
   *
   * That regex requires `calc(`, so `bottom-[72px]` — no calc, no inset —
   * sailed past it at six sites: the save bars on Edit profile and the
   * Showcase editor, the new-message composer, the Shots stage and its
   * skeleton, and a toast at `bottom-[84px]`. Every one of them was short by
   * exactly --sab, which is the bug --nav-space was introduced to fix.
   *
   * Three are still on the list and it is the lint ratchet's doing, not an
   * oversight: messages/new (3 pre-existing eslint errors) and ReelsFeed (5)
   * would have pulled that debt into a positioning change, and Skeletons.tsx
   * must keep frames identical to ReelsFeed's. Named, with the reason, so
   * the list cannot quietly grow.
   */
  const EDGE_HOLDOUTS = [
    "src/app/(app)/messages/new/page.tsx",
    "src/components/pwa/InstallPrompt.tsx",
    "src/components/shots/ReelsFeed.tsx",
    "src/components/skeletons/Skeletons.tsx",
  ];

  /**
   * Scoped to `fixed`, and to the same class string.
   *
   * `position: fixed` is what makes an offset viewport-relative, which is
   * the only way an element can be clearing the nav bar. MusicEditor has
   * `absolute bottom-[148px]` and `absolute bottom-[86px]` inside its own
   * panel — nav-sized numbers that have nothing to do with the nav, and a
   * per-file sweep flagged both.
   */
  function fixedNavOffsets(src: string): number[] {
    const NAV_ISH = 60;
    const out: number[] = [];
    // Each class string, quoted or templated, examined on its own: a file
    // may hold one of each.
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{`([\s\S]*?)`\})/g)) {
      const cls = m[1] ?? m[2] ?? m[3] ?? "";
      if (!/\bfixed\b/.test(cls)) continue;
      for (const b of cls.matchAll(/bottom-\[(\d+)px\]/g)) {
        if (Number(b[1]) >= NAV_ISH) out.push(Number(b[1]));
      }
    }
    return out;
  }

  it("the sweep can see a real offender at all", () => {
    // ReelsFeed is on the holdout list precisely because it still has one.
    // If this came back empty the assertion below would pass on nothing.
    expect(fixedNavOffsets(read("src/components/shots/ReelsFeed.tsx"))).toContain(72);
  });

  it("and ignores an absolute offset of the same size", () => {
    // MusicEditor's are inside its own panel.
    expect(fixedNavOffsets(read("src/components/shows/MusicEditor.tsx"))).toEqual([]);
  });

  it("nor off a bare nav-sized offset, except the four the ratchet holds", () => {
    const offenders = sourceFiles()
      .filter((f) => fixedNavOffsets(read(f)).length > 0)
      .map((f) => f.split("\\").join("/"))
      .sort();
    expect(offenders).toEqual([...EDGE_HOLDOUTS].sort());
  });

  it("the column's width is a variable too, for what sits against its edge", () => {
    // FloatingPages pinned a card to the column's right edge with the 480
    // written into the sum, so on a desktop it sat against a boundary that
    // had moved 100px outward. Three more sized cards off
    // `min(100vw, 480px)` — the column, by hand, inside a 680px one.
    expect(css).toContain("--app-col: 480px;");
    expect(css).toContain("max-width: var(--app-col);");
    const offenders = sourceFiles()
      .filter((f) => /\(100vw\s*-\s*480px\)|min\(100vw,\s*480px\)/.test(read(f)))
      .map((f) => f.split("\\").join("/"));
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("and the ones that were fixed read the variable", () => {
    for (const f of [
      "src/components/settings/EditProfileForm.tsx",
      "src/components/showcase/ShowcaseEditor.tsx",
    ]) {
      expect(read(f), f).toContain("bottom-[var(--nav-edge)]");
    }
    // A toast wants the air, so it clears rather than sits.
    expect(read("src/components/ui/ToastProvider.tsx")).toContain("bottom-[var(--nav-space)]");
  });

  it("and nothing sizes a page off a flat 84 any more", () => {
    // PremiumPlans had min-h-[calc(100dvh-84px)] — the exact flat 84 this
    // whole file exists because of — and DiaryHome spelled the sum out by
    // hand as `72px - var(--sab)`.
    const offenders = sourceFiles()
      .filter((f) => /100dvh\s*-\s*84px|-\s*72px\s*-\s*var\(--sat\)/.test(read(f)))
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
