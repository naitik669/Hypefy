import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  colors,
  layout,
  navSpace,
  cssVarName,
  radii,
  radiusVarName,
  fonts,
  weights,
  nativeFontWeights,
  type ColorName,
  type RadiusName,
} from "@hypefy/tokens";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every .tsx under src, for the weight census below. */
function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const read = (p: string) => readFileSync(p, "utf8");

/**
 * The palette exists twice — as `@theme` custom properties in globals.css,
 * which Tailwind turns into utilities, and as values in @hypefy/tokens, which
 * is what React Native will read from Phase 5. Two copies of a brand is how a
 * brand drifts: a colour gets nudged in one place, nobody notices, and six
 * months later the app and the website are almost the same shade of lime.
 *
 * Generating the CSS from the TypeScript would avoid that, at the cost of a
 * codegen step in front of every web build for a file that changes a few
 * times a year. This is the cheaper guarantee: read both, assert they agree,
 * in BOTH directions — a colour added to one and not the other fails here.
 */

const css = readFileSync("src/app/globals.css", "utf8");

/** The `@theme` block's colour declarations, as a map. */
function themeColors(): Map<string, string> {
  const block = css.slice(css.indexOf("@theme"), css.indexOf("\n}", css.indexOf("@theme")));
  const out = new Map<string, string>();
  for (const m of block.matchAll(/^\s*(--color-[a-z-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/gm)) {
    out.set(m[1], m[2].toLowerCase());
  }
  return out;
}

describe("the palette is the same in CSS and in TypeScript", () => {
  it("reads something at all from globals.css", () => {
    // A comparison over an empty map passes and proves nothing.
    expect(themeColors().size).toBeGreaterThan(10);
  });

  it("every token in TypeScript matches the CSS", () => {
    const theme = themeColors();
    for (const name of Object.keys(colors) as ColorName[]) {
      const cssName = cssVarName(name);
      expect(theme.has(cssName), `${cssName} is missing from @theme`).toBe(true);
      expect(theme.get(cssName), `${cssName} disagrees`).toBe(colors[name].toLowerCase());
    }
  });

  it("and every colour in the CSS exists in TypeScript", () => {
    // The other direction, which is the one that catches a colour added to
    // globals.css and never given to the native client.
    const known = new Set((Object.keys(colors) as ColorName[]).map(cssVarName));
    const missing = [...themeColors().keys()].filter((k) => !known.has(k));
    expect(missing, "in globals.css but not in @hypefy/tokens").toEqual([]);
  });

  it("the name mapping is the one the CSS actually uses", () => {
    expect(cssVarName("accentInk")).toBe("--color-accent-ink");
    expect(cssVarName("hypeDeep")).toBe("--color-hype-deep");
    expect(cssVarName("surface")).toBe("--color-surface");
  });
});

describe("the chrome measurements", () => {
  it("match the CSS", () => {
    expect(css).toContain(`--nav-h: ${layout.navHeight}px`);
    // The gap is inside a calc() with the safe-area inset, so it is matched
    // as part of that expression rather than as a token of its own.
    expect(css).toContain(`calc(var(--nav-h) + var(--sab) + ${layout.navGap}px)`);
  });

  it("navSpace is the bar plus the inset plus air", () => {
    expect(navSpace(0)).toBe(layout.navHeight + layout.navGap);
    expect(navSpace(34)).toBe(layout.navHeight + 34 + layout.navGap);
  });

  it("and a nonsense inset cannot shrink it", () => {
    // A negative inset would pull content under the bar, which is the bug
    // --nav-space exists to prevent.
    expect(navSpace(-50)).toBe(layout.navHeight + layout.navGap);
  });
});

/**
 * The radii existed only in @theme, so a native client would have had a
 * second copy — exactly the drift the palette block above exists to stop.
 * Asserted in both directions for the same reason.
 */
describe("the corner radii are the same in CSS and in TypeScript", () => {
  /** The `@theme` block's radius declarations, as a map. */
  function themeRadii(): Map<string, number> {
    const block = css.slice(css.indexOf("@theme"), css.indexOf("\n}", css.indexOf("@theme")));
    const out = new Map<string, number>();
    for (const m of block.matchAll(/^\s*(--radius-[a-z-]+):\s*(\d+)px\s*;/gm)) {
      out.set(m[1], Number(m[2]));
    }
    return out;
  }

  it("reads them from globals.css at all", () => {
    // A comparison over an empty map passes and proves nothing.
    expect(themeRadii().size).toBeGreaterThanOrEqual(3);
  });

  it("every radius in TypeScript matches the CSS", () => {
    const theme = themeRadii();
    for (const name of Object.keys(radii) as RadiusName[]) {
      const cssName = radiusVarName(name);
      expect(theme.has(cssName), `${cssName} is missing from @theme`).toBe(true);
      expect(theme.get(cssName), cssName).toBe(radii[name]);
    }
  });

  it("and every radius in the CSS is in TypeScript", () => {
    // The other direction: one added to @theme and not here fails too.
    const known = new Set((Object.keys(radii) as RadiusName[]).map(radiusVarName));
    const missing = [...themeRadii().keys()].filter((k) => !known.has(k));
    expect(missing, "in globals.css but not in @hypefy/tokens").toEqual([]);
  });

  it("pill is round enough to not be a radius", () => {
    // If it ever became a real corner size, every pill in the app would
    // quietly square off at the ends.
    expect(radii.pill).toBeGreaterThanOrEqual(100);
  });
});

describe("the typeface", () => {
  it("names the family the web actually loads", () => {
    // next/font's Plus_Jakarta_Sans import, and the same string satori is
    // given for the OpenGraph card.
    expect(fonts.sans).toBe("Plus Jakarta Sans");
  });

  it("is the family in the CSS font stack", () => {
    // The CSS reaches it through next/font's generated variable, so the
    // assertion is that the stack goes through that variable and then to a
    // system fallback — not that the family name appears literally.
    expect(css).toMatch(/--font-sans:\s*var\(--font-jakarta\)/);
    for (const fallback of fonts.sansFallback) {
      expect(css, `${fallback} is not in the font stack`).toContain(fallback);
    }
  });

  it("lists every weight the app uses", () => {
    // Measured from the font-* classes in src, not guessed. If a new weight
    // starts being used on the web, native needs the file for it.
    const used = new Set<string>();
    for (const f of sourceFiles()) {
      for (const m of read(f).matchAll(
        /\bfont-(normal|medium|semibold|bold|extrabold|black)\b/g,
      )) {
        used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(3);
    for (const name of used) {
      expect(Object.keys(weights), `font-${name} has no weight token`).toContain(name);
    }
  });

  it("clamps black to the heaviest weight the family has", () => {
    // Plus Jakarta Sans stops at 800. On the web the variable font already
    // clamps the 900 request; native would ask for a file that does not
    // exist.
    expect(weights.black).toBe(800);
    expect(Math.max(...Object.values(weights))).toBe(800);
  });

  it("and names the distinct files native has to bundle", () => {
    // Five, because black and extrabold are the same file.
    expect(nativeFontWeights()).toEqual([400, 500, 600, 700, 800]);
  });
});
