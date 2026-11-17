import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import {
  DESTINATIONS,
  bottomBarDestinations,
  sideNavDestinations,
} from "@hypefy/core/navigation";
import { ICONS, iconFor, mappedHrefs } from "../apps/mobile/src/icon-map";

/**
 * The native navigation, against the list both clients read.
 *
 * `@hypefy/core/navigation` was written in Phase 4a so the phone bar and
 * the desktop rail could not drift apart, and its own comment says the Expo
 * client would read it too. These assertions are what make that true rather
 * than merely intended: a destination added to core now fails here until
 * the native app has a route file and an icon for it.
 *
 * The failure being prevented is the quiet one. Nothing crashes when a
 * client silently offers one destination fewer — it just offers less, and
 * nobody notices until a user asks where something went.
 */

const TABS_DIR = "apps/mobile/app/(tabs)";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Source with comments removed.
 *
 * Six times in this repo a comment has satisfied an assertion meant to read
 * code — role="tab", role="slider", localStorage twice, AsyncStorage, and an
 * EXPO_PUBLIC_ name. Every source-as-text check here strips first.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** `/home` -> `home`, the route file's name. */
function routeName(href: string): string {
  return href.replace(/^\//, "");
}

describe("every destination the bar shows has somewhere to go", () => {
  it("a route file exists for each bottom-bar destination", () => {
    for (const d of bottomBarDestinations()) {
      const file = `${TABS_DIR}/${routeName(d.href)}.tsx`;
      expect(existsSync(file), `${d.label} has no route file at ${file}`).toBe(true);
    }
  });

  it("and Discover, which is routable but not in the bar", () => {
    // bottomBar: false, sideNav: true. It still needs a screen, or the
    // compass in the top bar (Phase 6) would navigate to nothing.
    const discover = DESTINATIONS.find((d) => d.href === "/discover");
    expect(discover?.bottomBar).toBe(false);
    expect(existsSync(`${TABS_DIR}/discover.tsx`)).toBe(true);
  });

  it("and no route file exists that core does not know about", () => {
    // The other direction. A screen with no destination is unreachable
    // from the bar and will rot unnoticed.
    const known = new Set(DESTINATIONS.map((d) => routeName(d.href)));
    const files = readdirSync(TABS_DIR)
      .filter((f) => f.endsWith(".tsx") && f !== "_layout.tsx")
      .map((f) => f.replace(/\.tsx$/, ""));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(known.has(f), `${f}.tsx has no destination in core`).toBe(true);
    }
  });
});

describe("every destination has an icon", () => {
  it("the bar's four, and Discover", () => {
    const needed = [...bottomBarDestinations().map((d) => d.href), "/discover"];
    for (const href of needed) {
      expect(Object.keys(ICONS), `${href} is not in icon-map`).toContain(href);
    }
  });

  it("and so does every side-rail destination, for when they arrive", () => {
    // Search, Library, Marketplace and Settings are long-press-only on the
    // phone today. They are mapped now so the screen that surfaces them
    // does not have to come back here.
    for (const d of sideNavDestinations()) {
      expect(Object.keys(ICONS), `${d.label} is not in icon-map`).toContain(d.href);
    }
  });

  it("the map holds nothing core has never heard of", () => {
    const known = new Set(DESTINATIONS.map((d) => d.href));
    for (const href of mappedHrefs()) {
      expect(known.has(href), `${href} is mapped but is not a destination`).toBe(true);
    }
  });

  it("focused and unfocused are different faces, not the same one twice", () => {
    for (const [href, pair] of Object.entries(ICONS)) {
      expect(pair.on, href).not.toBe(pair.off);
      expect(iconFor(href, true), href).toBe(pair.on);
      expect(iconFor(href, false), href).toBe(pair.off);
    }
  });

  it("an unmapped href falls back rather than throwing", () => {
    // What happens when somebody adds a destination and forgets this file.
    // The test above fails in CI; this is the behaviour if it ever ships.
    expect(() => iconFor("/not-a-destination", true)).not.toThrow();
    expect(iconFor("/not-a-destination", true)).toBe("ellipse");
    expect(iconFor("/not-a-destination", false)).toBe("ellipse-outline");
  });
});

describe("the layout reads core rather than restating it", () => {
  const layout = () => code(`${TABS_DIR}/_layout.tsx`);

  it("builds the bar from bottomBarDestinations()", () => {
    // The whole point. A hard-coded list here would compile, run, look
    // right, and drift from the web the first time a destination is added.
    expect(layout()).toMatch(/bottomBarDestinations\(\)/);
  });

  it("and names no destination of its own", () => {
    // Discover is the single exception: the layout has to single it out to
    // register it with href: null, because "routable but not in the bar"
    // is a navigator concept core has no opinion about.
    const src = layout();
    const quoted = [...src.matchAll(/"(\/[a-z-]+)"/g)].map((m) => m[1]);
    expect(quoted).toEqual(["/discover"]);
  });

  it("takes the bar's height from tokens, not a literal", () => {
    const src = layout();
    expect(src).toMatch(/layout\.navHeight/);
    // 72 is navHeight's value. Seeing it written out means somebody
    // inlined the token, and the web could move it without this following.
    expect(src).not.toMatch(/\b72\b/);
  });

  it("hides Discover from the bar instead of deleting it", () => {
    expect(layout()).toMatch(/href:\s*null/);
  });
});

describe("the placeholder leaves room for the bar", () => {
  it("reserves navSpace, the same figure the web's scroll containers use", () => {
    const src = code("apps/mobile/src/Placeholder.tsx");
    expect(src).toMatch(/navSpace\(/);
    // Specifically the inset-aware form. navSpace() with a constant would
    // be wrong on every phone with a gesture bar.
    expect(src).toMatch(/navSpace\(insets\.bottom\)/);
  });
});
