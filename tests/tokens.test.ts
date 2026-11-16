import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { colors, layout, navSpace, cssVarName, type ColorName } from "@hypefy/tokens";

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
