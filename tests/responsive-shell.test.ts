import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DESTINATIONS,
  bottomBarDestinations,
  sideNavDestinations,
  destinationFor,
} from "@hypefy/core/navigation";
import { breakpoints, columns, sideNavWidth, shapeFor, columnWidth } from "@hypefy/tokens";

/**
 * The responsive shell: one navigation, two renderings.
 *
 * The phone's bottom bar is hand-wired JSX — each tab carries its own hold
 * menu, badge and long-press behaviour — so it is NOT generated from
 * @hypefy/core/navigation, and a test that compared bottomBarDestinations()
 * with sideNavDestinations() would be comparing one module with itself.
 *
 * What is asserted instead is the property that actually matters, between two
 * independent artefacts: every destination the PHONE can reach also exists in
 * the rail. Desktop must never offer less than the phone does, which is the
 * failure this whole phase exists to prevent — the app was a 480px column, so
 * "wide screen" was the degraded one.
 *
 * BottomNav's source text is the phone's side of that comparison. Reading
 * source as text is the house pattern for a structural guarantee that cannot
 * be reached by calling a function (124 files do it), and it is honest about
 * what it proves: it catches a destination added to the bar and forgotten in
 * the rail, which is the drift that happens.
 */

const bottomNav = readFileSync("src/components/layout/BottomNav.tsx", "utf8");
const swipeNav = readFileSync("src/components/layout/SwipeNav.tsx", "utf8");

/** Every .ts/.tsx file under src, for the whole-codebase assertions. */
function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const sideNav = readFileSync("src/components/layout/SideNav.tsx", "utf8");
const appLayout = readFileSync("src/app/(app)/layout.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

/**
 * Every app route BottomNav links to.
 *
 * /create* is excluded deliberately: those are the four things the (+) button
 * MAKES, not places you navigate to, and they belong to the composer rather
 * than to a navigation. Query strings are stripped for the same reason.
 */
function bottomNavHrefs(): string[] {
  const found = new Set<string>();
  // Two forms, deliberately both: `href="/home"` on the JSX tab links, and
  // `href: "/search"` in the HOME_SHORTCUTS object literals. Matching only
  // the first found 4 of the 8 and quietly passed the superset check — which
  // is what the floor assertion below exists to catch.
  for (const m of bottomNav.matchAll(/href[=:]\s*(?:\{")?"?(\/[a-z0-9/-]+)/g)) {
    if (!m[1].startsWith("/create")) found.add(m[1]);
  }
  return [...found].sort();
}

/** The source with line comments removed, so prose cannot satisfy an assertion. */
function code(src: string): string {
  return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the phone's destinations all exist in the rail", () => {
  it("finds the hrefs in BottomNav at all", () => {
    // A loop over an empty list passes and proves nothing. Five tabs plus the
    // four hold-menu entries, minus Create: the floor is deliberately low
    // enough to survive a tab being renamed and high enough to catch a regex
    // that stopped matching.
    expect(bottomNavHrefs().length).toBeGreaterThanOrEqual(7);
  });

  it("every one of them is a known destination, shown in the rail", () => {
    const rail = new Set(sideNavDestinations().map((d) => d.href));
    for (const href of bottomNavHrefs()) {
      expect(rail.has(href), `${href} is reachable on the phone but not in the rail`).toBe(true);
    }
  });

  it("the rail is a superset of the bar, not a copy of it", () => {
    for (const d of bottomBarDestinations()) {
      expect(d.sideNav, `${d.href} is in the bar but not the rail`).toBe(true);
    }
    // The whole point of the rail: the four long-press-only destinations and
    // Discover get a real entry. If it ever equals the bar, it is a stretched
    // bottom bar and the gesture-only destinations are still unreachable by
    // mouse.
    expect(sideNavDestinations().length).toBeGreaterThan(bottomBarDestinations().length);
  });

  it("Discover has a rail entry, because a right-swipe is not a pointer gesture", () => {
    const discover = DESTINATIONS.find((d) => d.href === "/discover");
    expect(discover?.sideNav).toBe(true);
    expect(discover?.bottomBar).toBe(false);
  });

  it("every rail destination has an icon of its own", () => {
    // SideNav falls back to House for an unmapped href, which would render a
    // rail of identical icons rather than failing. Each one has to be named.
    for (const d of sideNavDestinations()) {
      expect(sideNav.includes(`"${d.href}": `), `no icon mapped for ${d.href}`).toBe(true);
    }
  });
});

describe("destinationFor matches whole segments", () => {
  it("lights the destination for its own route and children", () => {
    expect(destinationFor("/shots")?.href).toBe("/shots");
    expect(destinationFor("/messages/new")?.href).toBe("/messages");
  });

  it("does not light a destination for a route that merely starts the same", () => {
    // /shop is not /shots, /showcase is not /shows — a prefix match calls
    // both, which is the bug active-tab.ts already had to fix.
    expect(destinationFor("/shoppe")).toBe(null);
    expect(destinationFor("/searchlight")).toBe(null);
  });

  it("returns null for a route that is not a destination", () => {
    expect(destinationFor("/p/abc")).toBe(null);
  });
});

describe("the rail replaces the bar rather than stacking with it", () => {
  it("the bar's reserved space is zeroed at the rail's breakpoint", () => {
    // The scroll container pads by --nav-space so its last row clears the
    // bar. At lg there is no bar, so that padding is dead space at the foot
    // of every page.
    const lg = `@media (min-width: ${breakpoints.desktop}px)`;
    const at = css.indexOf(lg);
    expect(at, `${lg} is not in globals.css`).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("\n  }", at));
    expect(block).toMatch(/--nav-space:\s*0px/);
  });

  it("the scroll container reads that variable rather than a literal", () => {
    expect(appLayout).toContain("pb-[var(--nav-space)]");
  });

  /**
   * The premise, asserted — not just the consequence.
   *
   * Zeroing --nav-space at lg is only correct if the bar is actually gone
   * there. It was not: BottomNav had no lg:hidden, so the first version of
   * this shipped a bar fixed to the bottom of the window over content that
   * had stopped reserving any room for it. The test above passed throughout,
   * because it checked that the variable changed and never that the thing it
   * accounts for had.
   */
  it("the bar is hidden at exactly the breakpoint that stops reserving room for it", () => {
    const bar = bottomNav.slice(bottomNav.indexOf("<nav className="));
    const openTag = bar.slice(0, bar.indexOf(">"));
    expect(openTag).toContain("fixed inset-x-0 bottom-0");
    expect(openTag, "the bottom bar still renders at lg").toContain("lg:hidden");
  });

  it("and the rail appears at that same breakpoint, so one always exists", () => {
    // Hidden below lg, shown at lg, in that order: if both hid at lg there
    // would be no navigation at all on a wide screen, and each assertion
    // above would still pass on its own.
    expect(sideNav).toMatch(/\blg:flex\b/);
    expect(sideNav).not.toMatch(/\blg:hidden\b/);
  });

  it("the rail's width in CSS is the token's figure", () => {
    expect(css).toMatch(new RegExp(`--sidenav-w:\\s*${sideNavWidth}px`));
    expect(sideNav).toContain("var(--sidenav-w)");
  });

  it("the rail is hidden below its breakpoint and shown at it", () => {
    expect(sideNav).toContain("hidden");
    expect(sideNav).toMatch(/lg:flex/);
  });
});

describe("the rail is links, not a tablist", () => {
  it("marks the current page with aria-current", () => {
    expect(sideNav).toContain('aria-current={on ? "page" : undefined}');
  });

  it("does not claim the ARIA tab pattern", () => {
    // role="tab" promises arrow-key movement between the items, which these
    // do not implement — they are links that load a page. The creator and
    // activity strips needed the same correction.
    //
    // Comments stripped first: SideNav's own comment says the words role="tab"
    // to explain why it does not use it, and the raw text failed here.
    expect(code(sideNav)).not.toContain('role="tab"');
    expect(code(sideNav)).not.toContain('role="tablist"');
  });

  it("names the navigation for a screen reader", () => {
    expect(sideNav).toMatch(/aria-label="Main"/);
  });
});

describe("the column is defined once", () => {
  /**
   * `.app-column`'s three widths, read out of globals.css.
   *
   * The width used to be the literal `max-w-[480px]` at 35 call sites, which
   * is how the shell came to widen at tablet while thirteen full-screen
   * surfaces standing in for it stayed 480px — a narrow strip over a 680px
   * page. Adding two more literals at each of the 35 would have made the
   * next change a 105-edit job.
   */
  /**
   * Every `.app-column` rule, as [the breakpoint it applies from, the width].
   *
   * 0 means the unconditional rule. The breakpoint is the nearest preceding
   * `@media (min-width: …)` in the 240 characters before the selector, so a
   * rule moved out of its media block reads as 0 and fails rather than
   * quietly matching the wrong one.
   */
  function appColumnRules(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const m of css.matchAll(/\.app-column\s*\{([^}]*)\}/g)) {
      const width = m[1].match(/max-width:\s*(\d+)px/);
      if (!width) continue;
      const before = css.slice(Math.max(0, m.index - 240), m.index);
      const media = [...before.matchAll(/@media \(min-width:\s*(\d+)px\)\s*\{\s*$/g)].pop();
      out.push([media ? Number(media[1]) : 0, Number(width[1])]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  }

  it("reads three rules out of the stylesheet at all", () => {
    // A comparison over an empty list passes and proves nothing.
    expect(appColumnRules().length).toBe(3);
  });

  it("and they are the same three figures @hypefy/tokens holds", () => {
    // Two copies of a number is how a layout drifts. The native client reads
    // the tokens; the web reads the class. Asserted as a whole, so a width
    // present under the wrong breakpoint fails too.
    expect(appColumnRules()).toEqual([
      [0, columns.phone],
      [breakpoints.tablet, columns.tablet],
      [breakpoints.desktop, columns.desktop],
    ]);
  });

  /**
   * The literal still exists in exactly seven files, and why.
   *
   * 28 of the 35 sites migrated. These seven did not, and it is the lint
   * ratchet's doing rather than an oversight: CI blocks on eslint errors in
   * changed files, and six of these carry 33 pre-existing errors between
   * them — 18 `no-explicit-any` in WebRTC signalling payloads and 12
   * react-hooks correctness errors in the chat and call views. Swapping one
   * class in each would have pulled all 33 into this change's scope. That
   * debt is real and worth paying, but not inside a CSS rename, and not in
   * code only verifiable with an account and two devices.
   *
   * Skeletons.tsx has no debt of its own. It is here because its frames must
   * be character-for-character identical to RealChatView's and ReelsFeed's —
   * that is what stops the screen jumping as the real thing lands, and
   * loading-shapes.test.ts asserts it. Migrating one side alone would have
   * made the skeleton 600px over a 480px chat at tablet.
   *
   * Asserted as an exact set, not a maximum: a new literal somewhere else
   * fails here, and so does a file leaving the list without this comment
   * being updated.
   */
  const LITERAL_HOLDOUTS = [
    "src/app/(app)/messages/new/page.tsx",
    "src/components/calls/CallProvider.tsx",
    "src/components/calls/GroupCallProvider.tsx",
    "src/components/messages/InAppNotifier.tsx",
    "src/components/messages/RealChatView.tsx",
    "src/components/shots/ReelsFeed.tsx",
    "src/components/skeletons/Skeletons.tsx",
  ];

  it("the literal survives only in the files the ratchet kept it in", () => {
    const offenders = sourceFiles()
      .filter((f) => readFileSync(f, "utf8").includes("max-w-[480px]"))
      .map((f) => f.split("\\").join("/"))
      .sort();
    expect(offenders).toEqual([...LITERAL_HOLDOUTS].sort());
  });

  it("and the chat's two frames still match each other exactly", () => {
    // The reason Skeletons.tsx is on that list. If one of these is ever
    // migrated the other must move in the same commit.
    const chat = readFileSync("src/components/messages/RealChatView.tsx", "utf8");
    const skeleton = readFileSync("src/components/skeletons/Skeletons.tsx", "utf8");
    const frame = "fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col overflow-hidden bg-background";
    expect(chat).toContain(frame);
    expect(skeleton).toContain(frame);
  });

  it("the shell and the sliding panes use the class", () => {
    expect(signedInShell()).toContain("app-column");
    expect(anonShell()).toContain("app-column");
    expect((swipeNav.match(/app-column/g) ?? []).length).toBe(2);
  });

  it("gets wider at each shape and never narrower", () => {
    expect(columns.phone).toBeLessThan(columns.tablet);
    expect(columns.tablet).toBeLessThan(columns.desktop);
  });

  it("keeps the phone figure the app was built around", () => {
    // 480 appears at 35 call sites and inside SwipeNav's own arithmetic.
    // Changing it here would move a layout this phase is not touching.
    expect(columns.phone).toBe(480);
  });

  it("leaves room for the rail beside the desktop column", () => {
    expect(columns.desktop + sideNavWidth).toBeLessThanOrEqual(breakpoints.desktop);
  });

  /**
   * The layout holds TWO shells — an anonymous one for shared links and the
   * signed-in one — and each sets its own widths. Searching the whole file
   * for `lg:max-w-[680px]` passed on the anonymous shell's copy even with the
   * signed-in column's `lg:` deleted, so each half is read separately.
   */
  const SPLIT = "const [profile";
  const anonShell = () => appLayout.slice(0, appLayout.indexOf(SPLIT));
  const signedInShell = () => appLayout.slice(appLayout.indexOf(SPLIT));

  it("is split where the test thinks it is", () => {
    // Both slices non-empty, or the two assertions below read the same text.
    expect(appLayout.indexOf(SPLIT)).toBeGreaterThan(0);
    expect(signedInShell().length).toBeGreaterThan(1000);
  });

  it("is what the signed-in shell actually applies", () => {
    expect(signedInShell()).toContain("app-column");
  });

  it("gives the anonymous shell the same width as the signed-in one", () => {
    // Shared links — a post, a profile, a Shot — are the traffic most likely
    // to arrive on a desktop, and that shell was getting the phone column.
    // Now there is one class, so "the same" is structural rather than three
    // literals that have to be kept in step.
    expect(anonShell()).toContain("app-column");
  });

  it("and the admin desk still opts out, because it is a tool not a feed", () => {
    // 1400px of tables. The one route that was always allowed to say so.
    expect(signedInShell()).toContain("max-w-[1400px]");
  });
});

describe("columnWidth is what the column actually measures", () => {
  it("is the viewport when the viewport is narrower than the cap", () => {
    // A 390px phone gets 390, not 480. SwipeNav travels the pages exactly
    // this far, so a figure wider than the screen would overshoot.
    expect(columnWidth(390)).toBe(390);
    expect(columnWidth(360)).toBe(360);
  });

  it("is the cap for the shape once the viewport is wider", () => {
    expect(columnWidth(480)).toBe(columns.phone);
    expect(columnWidth(768)).toBe(columns.tablet);
    expect(columnWidth(1024)).toBe(columns.desktop);
    expect(columnWidth(1440)).toBe(columns.desktop);
  });

  it("never exceeds the viewport, at any width", () => {
    for (const w of [1, 200, 390, 600, 767, 768, 900, 1023, 1024, 1920, 3840]) {
      expect(columnWidth(w), `${w}px`).toBeLessThanOrEqual(w);
    }
  });

  it("never goes to zero or negative, whatever it is handed", () => {
    // It divides nothing, but it IS a travel distance and a commit
    // denominator — a zero would make every swipe commit instantly.
    for (const w of [0, -1, -9999, Number.NaN]) {
      expect(columnWidth(w)).toBeGreaterThan(0);
    }
  });

  it("grows with the viewport and never shrinks", () => {
    let last = 0;
    for (let w = 100; w <= 2000; w += 7) {
      const now = columnWidth(w);
      expect(now, `${w}px went backwards`).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });
});

describe("the sliding tabs agree with the column they slide", () => {
  /**
   * SwipeNav moves the outgoing and incoming tabs exactly one column apart
   * and commits a swipe at a fraction of that distance. Both figures were
   * the phone column, hard-coded — `Math.min(innerWidth, 480)` for travel
   * and `window.innerWidth` for the commit. Widening the column made the
   * first land the incoming tab 120px short at tablet, and the second always
   * wrong on a wide screen: 28% of 1440px to commit a 680px page.
   */
  it("takes its travel distance from the token, not a literal", () => {
    expect(swipeNav).toContain("columnWidth(window.innerWidth");
    expect(code(swipeNav)).not.toContain("Math.min(window.innerWidth || 1, 480)");
  });

  it("measures the commit against the page, not the window", () => {
    expect(swipeNav).toContain("const width = pageWidth();");
    expect(code(swipeNav)).not.toContain("const width = window.innerWidth || 1;");
  });

  it("draws both travelling panes as the column itself", () => {
    // The stand-in and the incoming tab. Narrower than the column they
    // replace and a strip of the page underneath shows beside them — so they
    // read the same class, not a copy of its figures.
    expect((swipeNav.match(/app-column/g) ?? []).length).toBe(2);
  });
});

describe("a sheet becomes a dialog where there is a mouse", () => {
  const sheet = readFileSync("src/components/ui/BottomSheet.tsx", "utf8");

  /** The one media block that re-shapes the sheet. */
  function dialogBlock(): string {
    const q = "@media (min-width: 1024px) and (pointer: fine)";
    const at = css.indexOf(q);
    expect(at, `${q} is not in globals.css`).toBeGreaterThan(-1);
    // To the closing brace of the media block: the last line that is a lone
    // "}" at column 0.
    const end = css.indexOf("\n}", css.indexOf("[data-sheet-grip]", at));
    expect(end).toBeGreaterThan(at);
    return css.slice(at, end);
  }

  it("keys off the input device, not only the width", () => {
    // A 1024px touch tablet in landscape is still something you throw a
    // sheet on. Width alone would have given it a centred dialog with a
    // grab handle it could use but that had been hidden.
    const b = dialogBlock();
    expect(b).toContain("pointer: fine");
    expect(b).toContain("min-width: 1024px");
  });

  it("centres it, closes its corners and rings it", () => {
    const b = dialogBlock();
    expect(b).toMatch(/\[data-sheet-veil\][\s\S]*align-items:\s*center/);
    expect(b).toMatch(/border-radius:/);
    expect(b).toMatch(/border:\s*1px solid/);
  });

  it("hides the grip, which cannot be grabbed with a mouse", () => {
    // The drag is implemented with touch handlers only — there is no
    // onPointerDown on the handle — so on a fine pointer the grip promises
    // a gesture that cannot happen.
    expect(dialogBlock()).toMatch(/\[data-sheet-grip\]\s*\{\s*display:\s*none/);
    const handle = sheet.slice(sheet.indexOf("data-sheet-handle"));
    expect(handle.slice(0, 400)).not.toContain("onPointerDown");
  });

  it("the component publishes the hooks the CSS needs", () => {
    // The CSS is the whole mechanism, so a renamed attribute would leave
    // the rule matching nothing and fail silently.
    for (const attr of ["data-sheet-veil", "data-sheet=", "data-sheet-grip", "data-sheet-footer"]) {
      expect(sheet, `${attr} is gone from BottomSheet`).toContain(attr);
    }
  });

  it("and the dialog has an accessible name", () => {
    // role="dialog" aria-modal with no name is announced as just "dialog".
    // 43 of the 45 call sites pass a title.
    expect(sheet).toContain("aria-labelledby={title ? titleId : undefined}");
    expect(sheet).toContain("id={titleId}");
    expect(sheet).toContain("useId()");
  });
});

describe("shapeFor", () => {
  it("names each shape at its own boundary", () => {
    expect(shapeFor(breakpoints.tablet)).toBe("tablet");
    expect(shapeFor(breakpoints.desktop)).toBe("desktop");
  });

  it("is phone one pixel below tablet, and tablet one below desktop", () => {
    expect(shapeFor(breakpoints.tablet - 1)).toBe("phone");
    expect(shapeFor(breakpoints.desktop - 1)).toBe("tablet");
  });

  it("handles the extremes", () => {
    expect(shapeFor(0)).toBe("phone");
    expect(shapeFor(3840)).toBe("desktop");
  });
});
