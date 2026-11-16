import { test, expect } from "@playwright/test";
import { noHorizontalScroll } from "./helpers";

/**
 * Everything checkable without an account.
 *
 * The point of splitting these out: core-flows.spec.ts can only run where a
 * test account is configured, and until one is, it reports nothing. These
 * cover the auth wall, the offline and PWA surfaces, the security headers and
 * the layout contract — all of which are real regressions if they break, and
 * all of which run anywhere, including a fresh clone and CI without secrets.
 *
 * Non-destructive, like the rest of the suite: nothing here writes.
 */

test.describe("the auth wall holds", () => {
  test("the sign-in page offers a real form", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByPlaceholder("Enter your email address")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("an app route sends a signed-out visitor away", async ({ page }) => {
    // The guarantee: /home is not readable without a session. Asserted on the
    // landing path rather than on a specific destination, because where the
    // app sends you (onboarding, /signin, /) is a product decision that may
    // change — that it does not serve you the feed is not.
    await page.goto("/home");
    await page.waitForURL((url) => !url.pathname.startsWith("/home"), { timeout: 90_000 });
    expect(new URL(page.url()).pathname).not.toBe("/home");
  });

  test("and so does the creator dashboard", async ({ page }) => {
    await page.goto("/creator");
    await page.waitForURL((url) => !url.pathname.startsWith("/creator"), { timeout: 90_000 });
    expect(new URL(page.url()).pathname).not.toBe("/creator");
  });
});

test.describe("the surfaces that work when nothing else does", () => {
  test("the offline page is self-contained", async ({ page }) => {
    // Served by the service worker on web AND as Capacitor's server.errorPath,
    // so it has to stand up with no app, no JS bundle and no network. A
    // stylesheet or script reference here would mean a blank screen in the
    // one moment this page exists for.
    const res = await page.goto("/offline.html");
    expect(res?.status()).toBe(200);
    const html = await page.content();
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("the service worker is served from the root scope", async ({ request }) => {
    // Registered with { scope: "/" }, which a browser only honours if the file
    // itself is served from the root.
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] ?? "").toMatch(/javascript/);
  });

  test("the manifest describes an installable app", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/home");
    // At least one icon, and a maskable one, or Android draws a white box
    // around it on the launcher.
    expect(Array.isArray(m.icons) && m.icons.length).toBeTruthy();
    expect(JSON.stringify(m.icons)).toContain("maskable");
  });
});

test.describe("security headers reach the browser", () => {
  // These live in next.config.ts and apply to /(.*) unconditionally. Easy to
  // lose in a config edit and invisible until somebody frames the app.
  test("the response carries them", async ({ request }) => {
    const res = await request.get("/signin");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"] ?? "").toContain("max-age=");
  });

  test("and the app is not marked noindex", async ({ request }) => {
    // X-Robots-Tag was deliberately removed when the app stopped being
    // invite-only: with it, shared profiles, posts and Shots — and the
    // privacy/terms pages Google's OAuth review fetches — stay out of search.
    const res = await request.get("/signin");
    expect(res.headers()["x-robots-tag"]).toBeUndefined();
  });
});

test.describe("the pages that must render for somebody else's review", () => {
  // Google's OAuth consent review fetches the privacy and terms pages, and the
  // stores ask for guidelines and a child-safety page. They are also pure
  // server renders with no account behind them, which makes them the broadest
  // account-free exercise of the import graph available — exactly what a
  // structural refactor is most likely to break silently.
  // Each page's own heading, not a body-length check.
  //
  // The length check was the first thing written here and it was worthless:
  // mutation-checking it — replacing the privacy page with `return null` —
  // left the test green, because the cookie-consent banner in the root layout
  // is over two hundred characters of text on its own. A page can render
  // nothing at all and still clear that bar.
  const PAGES: [string, string][] = [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
    ["/guidelines", "Community Guidelines"],
    ["/child-safety", "Child Safety Standards"],
    ["/cookies", "Cookie Policy"],
  ];

  for (const [path, heading] of PAGES) {
    test(`${path} renders its own content`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should not error`).toBeLessThan(400);
      await expect(
        page.getByRole("heading", { name: heading, level: 1 }),
        `${path} should show its own h1`,
      ).toBeVisible();
    });
  }

  test("robots and sitemap are served", async ({ request }) => {
    // Both are generated routes (app/robots.ts, app/sitemap.ts), so they break
    // like code rather than like static files.
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/user-agent/i);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<urlset");
  });
});

const SHAPES = [
  ["phone", 390, 844],
  ["tablet", 768, 1024],
  ["laptop", 1024, 768],
  ["desktop", 1440, 900],
] as const;

test.describe("the layout contract", () => {
  // The check Phase 4 leans on: no sideways scroll at any shape. /signin plus
  // the legal pages, which are the widest account-free exercise of the layout
  // available — a full server render through the root layout at each width.
  for (const [label, width, height] of SHAPES) {
    for (const path of ["/signin", "/privacy", "/terms"]) {
      test(`${path} does not scroll sideways at ${label} (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(path);
        await noHorizontalScroll(page);
      });
    }
  }
});

test.describe("the breakpoint contract fires in a real browser", () => {
  /**
   * --nav-space is the room a scroll container leaves below itself for the
   * bottom bar. At >= 1024 there is no bar — the side rail replaces it — so
   * the variable is overridden to 0, and a page that still padded by it would
   * carry 84px of dead space at the foot of every screen.
   *
   * Asserted here rather than only as CSS text because a media query is one
   * of the few things a source-reading test genuinely cannot prove: the
   * declaration can be present and still lose to a later rule, or sit in a
   * block that never matches. This runs the cascade.
   */
  async function navSpacePx(page: import("@playwright/test").Page): Promise<number> {
    return page.evaluate(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--nav-space");
      // calc() is resolved for a custom property only when it is used, so
      // measure it on a real element rather than parsing the declaration.
      const probe = document.createElement("div");
      probe.style.height = "var(--nav-space)";
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      document.body.appendChild(probe);
      const px = probe.getBoundingClientRect().height;
      probe.remove();
      return v.trim() === "" ? -1 : px;
    });
  }

  test("the bar's space is reserved below the rail's breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/signin");
    // 72px bar + inset + 12px air. The exact figure depends on the device's
    // safe-area inset, which is 0 in a desktop browser; the guarantee is that
    // room IS reserved, not how much.
    expect(await navSpacePx(page)).toBeGreaterThan(0);
  });

  test("and is zero at the rail's breakpoint, where there is no bar", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/signin");
    expect(await navSpacePx(page)).toBe(0);
  });

  /**
   * The sheet-to-dialog rule, measured rather than read.
   *
   * It has to beat Tailwind's own utilities on the same element —
   * `max-w-[480px]`, `rounded-t-3xl`, `border-t` — and an attribute selector
   * has exactly the same specificity as a class. Whether it wins comes down
   * to cascade layers, which no amount of reading the file can settle. So a
   * probe is built with the component's real class list and the computed
   * style is read off it.
   *
   * Deliberately not the real BottomSheet: every one of the 45 call sites is
   * behind authentication, and this asserts the CSS rule, which is the whole
   * mechanism.
   */
  const PROBE = `(() => {
    const veil = document.createElement("div");
    veil.setAttribute("data-sheet-veil", "");
    veil.className = "fixed inset-0 z-[200] flex items-end justify-center";
    const sheet = document.createElement("div");
    sheet.setAttribute("data-sheet", "");
    sheet.className = "flex w-full max-w-[480px] flex-col rounded-t-3xl border-t border-border bg-elevated";
    const grip = document.createElement("div");
    grip.setAttribute("data-sheet-grip", "");
    grip.className = "mx-auto mb-3 h-1.5 w-10 rounded-full bg-border";
    sheet.appendChild(grip);
    veil.appendChild(sheet);
    document.body.appendChild(veil);
    const s = getComputedStyle(sheet), v = getComputedStyle(veil), g = getComputedStyle(grip);
    const out = {
      align: v.alignItems,
      maxWidth: s.maxWidth,
      topLeft: s.borderTopLeftRadius,
      bottomLeft: s.borderBottomLeftRadius,
      bottomBorder: s.borderBottomWidth,
      grip: g.display,
    };
    veil.remove();
    return out;
  })()`;

  test("a sheet is a centred dialog where there is a mouse and room", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/signin");
    const s = await page.evaluate(PROBE);
    expect(s.align).toBe("center");
    expect(s.maxWidth).toBe("560px");
    // All four corners, not just the top two.
    expect(s.bottomLeft).toBe(s.topLeft);
    expect(s.bottomLeft).not.toBe("0px");
    // Ringed, not just capped with a top edge.
    expect(s.bottomBorder).toBe("1px");
    // The grab handle is touch-only; a mouse cannot grab it.
    expect(s.grip).toBe("none");
  });

  test("and is still a sheet just below that width", async ({ page }) => {
    // 1023px with the same (fine) pointer: isolates the width half of the
    // rule, so a pass at 1440 cannot be coming from the pointer alone.
    await page.setViewportSize({ width: 1023, height: 800 });
    await page.goto("/signin");
    const s = await page.evaluate(PROBE);
    expect(s.align).toBe("flex-end");
    expect(s.maxWidth).toBe("480px");
    expect(s.bottomLeft).toBe("0px");
    expect(s.bottomBorder).toBe("0px");
    expect(s.grip).not.toBe("none");
  });

  /**
   * The bar and the space it needs, checked together.
   *
   * These are two separate decisions in two separate files — `lg:hidden` on
   * BottomNav and `--nav-space: 0` in globals.css — and they are only
   * correct as a pair. The first version of this work had the second without
   * the first: a bar fixed to the bottom of a 1440px window, over content
   * that had stopped reserving any room for it.
   */
  const BAR_PROBE = `(() => {
    const bar = document.createElement("div");
    bar.className = "fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[var(--nav-h)] w-full max-w-[480px] lg:hidden";
    document.body.appendChild(bar);
    const probe = document.createElement("div");
    probe.style.height = "var(--nav-space)";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const out = {
      barDisplay: getComputedStyle(bar).display,
      navSpace: probe.getBoundingClientRect().height,
    };
    bar.remove();
    probe.remove();
    return out;
  })()`;

  test("the bar and the room it needs disappear together at desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/signin");
    const s = await page.evaluate(BAR_PROBE);
    expect(s.barDisplay).toBe("none");
    expect(s.navSpace).toBe(0);
  });

  test("and both are present together below it", async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await page.goto("/signin");
    const s = await page.evaluate(BAR_PROBE);
    expect(s.barDisplay).not.toBe("none");
    expect(s.navSpace).toBeGreaterThan(0);
  });

  /**
   * `.app-column` resolving on a real element.
   *
   * The column width was `max-w-[480px]` at 35 sites and is now one class.
   * It is plain unlayered CSS sitting beside Tailwind utilities on the same
   * elements, and it only works because unlayered rules beat layered ones —
   * which is a property of how the stylesheet is assembled, not of anything
   * readable in the source. A Tailwind upgrade or an @layer wrapper would
   * break every column in the app at once and no source-reading test would
   * notice.
   */
  for (const [label, width, expected] of [
    ["phone", 390, "480px"],
    ["tablet", 800, "600px"],
    ["desktop", 1440, "680px"],
  ] as const) {
    test(`the content column is ${expected} at ${label} (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/signin");
      const got = await page.evaluate(() => {
        // The shell's own class list, so the utilities that sit beside the
        // class in the real markup are present and competing.
        const d = document.createElement("div");
        d.className = "relative mx-auto flex min-h-dvh w-full app-column flex-col bg-background";
        document.body.appendChild(d);
        const w = getComputedStyle(d).maxWidth;
        d.remove();
        return w;
      });
      expect(got).toBe(expected);
    });
  }

  /**
   * The nav variables, resolved.
   *
   * --nav-space is what a scroll container CLEARS (height + inset + 12px of
   * air). --nav-edge is what something SITS ON (height + inset, no air): a
   * save bar pinned above the nav should touch it. Six sites wrote a bare
   * `bottom-[72px]`, which is the height with the inset left out, so on a
   * phone with a gesture bar they overlapped it — the same arithmetic error
   * --nav-space was introduced to fix, in a position rather than a pad.
   *
   * Measured, not read: a var() that resolves to nothing is not a CSS error,
   * it silently makes the property invalid. `--app-col` came back empty once
   * during this work and `max-width: var(--app-col)` quietly became no limit
   * at all — every column in the app unbounded, with the source looking
   * perfectly correct.
   */
  const VARS = `(() => {
    const px = (v) => {
      const d = document.createElement("div");
      d.style.position = "absolute";
      d.style.visibility = "hidden";
      d.style.height = v;
      document.body.appendChild(d);
      const h = d.getBoundingClientRect().height;
      d.remove();
      return h;
    };
    const cs = getComputedStyle(document.documentElement);
    return {
      appCol: cs.getPropertyValue("--app-col").trim(),
      navEdge: px("var(--nav-edge)"),
      navSpace: px("var(--nav-space)"),
    };
  })()`;

  for (const [label, width, col, edge] of [
    ["phone", 390, "480px", 72],
    ["tablet", 800, "600px", 72],
    ["desktop", 1440, "680px", 0],
  ] as const) {
    test(`the nav and column variables resolve at ${label} (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/signin");
      const v = await page.evaluate(VARS);
      // Non-empty, or `max-width: var(--app-col)` is no limit at all.
      expect(v.appCol).toBe(col);
      // The inset is 0 in a desktop browser, so this is the bar's height
      // below lg and nothing at it.
      expect(v.navEdge).toBe(edge);
      // Always 12px more than the edge, except where both are gone.
      expect(v.navSpace).toBe(edge === 0 ? 0 : edge + 12);
    });
  }

  test("and the admin desk opts out of it entirely", async ({ page }) => {
    // 1400px of tables, not a feed. If the class ever started applying to
    // this, the one route allowed to use the whole window would lose it.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/signin");
    const got = await page.evaluate(() => {
      const d = document.createElement("div");
      d.className = "mx-auto w-full max-w-[1400px]";
      document.body.appendChild(d);
      const w = getComputedStyle(d).maxWidth;
      d.remove();
      return w;
    });
    expect(got).toBe("1400px");
  });

  test("the rail's width is published for the shell to read", async ({ page }) => {
    await page.goto("/signin");
    const w = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--sidenav-w").trim(),
    );
    expect(w).toBe("240px");
  });
});
