import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import {
  DESTINATIONS,
  bottomBarDestinations,
  sideNavDestinations,
} from "@hypefy/core/navigation";
import { ICONS, specFor, mappedHrefs, FALLBACK } from "../apps/mobile/src/icon-map";

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

  /**
   * Route files in (tabs) that are deliberately not destinations.
   *
   * The list is closed, and an entry has to earn its place here: the
   * point of the test below is that a screen nothing can reach will rot
   * unnoticed, so an exception must name what DOES reach it.
   *
   *   create-slot — creating is an action, not a place, which is why it
   *     is not in core's DESTINATIONS and why the web renders a button
   *     between its nav items rather than a nav item. The slot exists
   *     only so the navigator has something to attach that button to,
   *     and the assertion below is that the button is really there.
   */
  const NOT_DESTINATIONS: Readonly<Record<string, string>> = {
    "create-slot": "tabBarButton: () => <CreateButton />",
  };

  it("and no route file exists that core does not know about", () => {
    // The other direction. A screen with no destination is unreachable
    // from the bar and will rot unnoticed.
    const known = new Set(DESTINATIONS.map((d) => routeName(d.href)));
    const files = readdirSync(TABS_DIR)
      .filter((f) => f.endsWith(".tsx") && f !== "_layout.tsx")
      .map((f) => f.replace(/\.tsx$/, ""));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      if (f in NOT_DESTINATIONS) continue;
      expect(known.has(f), `${f}.tsx has no destination in core`).toBe(true);
    }
  });

  it("and each exception is reached by the thing it says reaches it", () => {
    /*
     * An exception that merely claims to be reachable is the same rot
     * with a note attached. Each one names the layout code that puts it
     * in front of somebody, and that code has to exist.
     */
    const layoutSrc = code(`${TABS_DIR}/_layout.tsx`);
    for (const [file, reached] of Object.entries(NOT_DESTINATIONS)) {
      expect(
        existsSync(`${TABS_DIR}/${file}.tsx`),
        `${file} is listed as an exception but has no route file`,
      ).toBe(true);
      expect(layoutSrc, `nothing in the layout reaches ${file}`).toContain(reached);
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

  it("an unmapped href falls back rather than throwing", () => {
    // What happens when somebody adds a destination and forgets this file.
    // The test above fails in CI; this is the behaviour if it ever ships.
    expect(() => specFor("/not-a-destination")).not.toThrow();
    expect(specFor("/not-a-destination")).toEqual(FALLBACK);
  });
});

describe("the layout reads core rather than restating it", () => {
  const layout = () => code(`${TABS_DIR}/_layout.tsx`);

  it("builds the bar from bottomBarDestinations()", () => {
    // The whole point. A hard-coded list here would compile, run, look
    // right, and drift from the web the first time a destination is added.
    expect(layout()).toMatch(/bottomBarDestinations\(\)/);
  });

  it("and names only the two destinations it has a navigator reason to", () => {
    /*
     * The list is closed on purpose, so a third hard-coded href has to be
     * justified here before it can ship. Both of these are navigator
     * concepts core has no opinion about:
     *
     *   /discover — routable but not in the bar, so it is registered with
     *     href: null rather than left out, which would make it unroutable.
     *   /shots — full-bleed video, so the header is turned off for it.
     *   /create — an ACTION rather than a destination, and so deliberately
     *     absent from core's list. The web's bar renders a button between
     *     its nav items for the same reason; this is where that button
     *     goes.
     *
     * Anything else named here is a destination list growing a second
     * copy, which is what reading from core was meant to prevent.
     */
    const quoted = [...new Set([...layout().matchAll(/"(\/[a-z-]+)"/g)].map((m) => m[1]))].sort();
    expect(quoted).toEqual(["/create", "/discover", "/shots"]);
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

describe("Discover is reachable at all", () => {
  /*
   * The gap the tabs layout created. Discover is `bottomBar: false`, so it
   * has a route and nothing navigates to it — on the web the compass in
   * the top bar is one of two ways in, and the swipe right from the feed
   * is the other. The swipe is later work, so the compass is currently the
   * ONLY way, and a route nothing links to is indistinguishable from a
   * route that does not exist.
   */
  const topBar = () => code("apps/mobile/src/TopBar.tsx");

  it("the top bar navigates to it", () => {
    expect(topBar()).toMatch(/router\.push\(\s*["'`]\/discover["'`]\s*\)/);
  });

  it("and says so to a screen reader", () => {
    // An unlabelled icon button is a button announced as "button".
    expect(topBar()).toMatch(/accessibilityLabel="Discover"/);
  });

  it("and the bar is actually mounted, not just written", () => {
    // A component nobody renders is the same as no component. This is the
    // assertion the other two are worthless without.
    const layout = code(`${TABS_DIR}/_layout.tsx`);
    expect(layout).toMatch(/header:\s*\(\)\s*=>\s*<TopBar\s*\/>/);
    expect(layout).toMatch(/headerShown:\s*true/);
  });

  it("except on Shots, which is full-bleed", () => {
    const layout = code(`${TABS_DIR}/_layout.tsx`);
    expect(layout).toMatch(/headerShown:\s*d\.href\s*!==\s*"\/shots"/);
  });

  it("and Shots is therefore the one screen padding for its own notch", () => {
    /*
     * The pair that has to agree. With a header the navigator starts the
     * scene below it, so a screen padding for the inset as well would
     * inset twice; without one, a screen that does not pad sits under the
     * status bar. Exactly one tab is in the second case.
     *
     * Two mechanisms now, which is why this matches either: a Placeholder
     * takes `ownsTopInset`, and a real screen reads `insets.top` itself.
     * Shots stopped being a Placeholder when the video player landed, and
     * asserting only the prop would have called that a regression — the
     * guarantee is "exactly one tab pads for the notch", not "exactly one
     * tab passes this prop".
     */
    const owners = readdirSync(TABS_DIR)
      .filter((f) => f.endsWith(".tsx") && f !== "_layout.tsx")
      .filter((f) => /ownsTopInset|insets\.top/.test(code(`${TABS_DIR}/${f}`)))
      .map((f) => f.replace(/\.tsx$/, ""));
    expect(owners).toEqual(["shots"]);
  });
});

describe("the top bar's height is the shared one", () => {
  it("comes from tokens, not from a literal", () => {
    const src = code("apps/mobile/src/TopBar.tsx");
    expect(src).toMatch(/layout\.topBarHeight/);
    // 56 is the token's value. Written out, it means the web could move
    // the bar and this would not follow.
    expect(src).not.toMatch(/\b56\b/);
  });

  it("and adds the safe-area inset, as the web's calc() does", () => {
    expect(code("apps/mobile/src/TopBar.tsx")).toMatch(
      /layout\.topBarHeight\s*\+\s*insets\.top/,
    );
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
