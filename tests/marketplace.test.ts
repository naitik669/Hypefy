// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import {
  CATEGORY_PAGES,
  buildItems,
  categoryPage,
  filterAndSort,
  NOTHING_WORN,
  blockedReason,
  isOwned,
  isWorn,
  itemAction,
  neighbours,
  placesFor,
  showcaseOf,
  wornColumn,
  type Worn,
} from "@/lib/marketplace";

/**
 * The Marketplace: every category filters to exactly its items, sorting by
 * price puts priced items in order and Premium after them, what you own is
 * marked, and the Android app shows nothing to buy.
 */

const PRICES = {
  "deco-flames": 4900, "deco-crown": 4900, "deco-hearts": 4900,
  "theme-arcade": 7900, "theme-candy": 7900,
  "bubble-kawaii": 5900, "bubble-pixel": 5900, "bubble-gold": 5900,
};

describe("filter and sort", () => {
  const items = buildItems(PRICES);

  it("filters to one category", () => {
    const bubbles = filterAndSort(items, "bubble", "featured");
    expect(bubbles.length).toBe(17);
    expect(bubbles.every((i) => i.category === "bubble")).toBe(true);
  });

  it("doesn't list free chat themes", () => {
    expect(items.some((i) => i.id === "theme-lime")).toBe(false);
  });

  it("sorts priced items low to high, then Premium", () => {
    const sorted = filterAndSort(items, "all", "price-low");
    const prices = sorted.map((i) => i.pricePaise ?? Infinity);
    const firstPremium = prices.indexOf(Infinity);
    expect(prices.slice(0, firstPremium)).toEqual([...prices.slice(0, firstPremium)].sort((a, b) => a - b));
    expect(prices.slice(firstPremium).every((p) => p === Infinity)).toBe(true);
  });

  it("sorts high to low", () => {
    const sorted = filterAndSort(items, "all", "price-high").filter((i) => i.pricePaise);
    const prices = sorted.map((i) => i.pricePaise!);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    expect(prices.at(-1)).toBe(4900);
  });

  it("puts Premium first when asked", () => {
    const sorted = filterAndSort(items, "all", "premium");
    const firstShop = sorted.findIndex((i) => i.tier === "shop");
    expect(sorted.slice(0, firstShop).every((i) => i.tier === "premium")).toBe(true);
  });

  it("knows what's yours", () => {
    const crown = items.find((i) => i.id === "deco-crown")!;
    const halo = items.find((i) => i.id === "deco-halo")!;
    expect(isOwned(crown, ["deco-crown"], false)).toBe(true);
    expect(isOwned(halo, [], false)).toBe(false);
    expect(isOwned(halo, [], true)).toBe(true);
    // Premium includes the Shop: a Premium member has the crown without buying it,
    // and without Premium only a purchase unlocks it.
    expect(isOwned(crown, [], true)).toBe(true);
    expect(isOwned(crown, [], false)).toBe(false);
  });
});

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/native", () => ({ isNative: () => native.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
/** Every change to what you wear, as [patch, your id]. */
const updates = vi.hoisted(() => ({ calls: [] as [Record<string, unknown>, string][], fail: false }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updates.calls.push([patch, id]);
          return { error: updates.fail ? { message: "nope" } : null };
        },
      }),
    }),
  }),
}));

const ME = { name: "Naitik Kushwaha", username: "naitik", avatarUrl: null, hue: 150 };

describe("the Marketplace as places", () => {
  it("has a page for every category, and none for anything else", () => {
    // Chat themes are not among them: one belongs to a conversation, and is
    // picked inside it. See ChatThemePicker.
    expect(CATEGORY_PAGES.map((c) => c.slug)).toEqual(["frames", "bubbles", "names", "nameplates"]);
    expect(categoryPage("themes")).toBeUndefined();
    expect(categoryPage("frames")?.category).toBe("frame");
    expect(categoryPage("hats")).toBeUndefined();
  });

  it("shows a real item from each category on the home", () => {
    const items = buildItems(PRICES);
    for (const page of CATEGORY_PAGES) {
      const show = showcaseOf(page, items);
      expect(show?.category, page.slug).toBe(page.category);
      // The one it names, not just whichever came first.
      expect(show?.id, page.slug).toBe(page.showcase);
    }
  });

  it("falls back to the first item if a showcase has left the catalogue", () => {
    const items = buildItems(PRICES);
    const gone = { ...categoryPage("frames")!, showcase: "deco-retired" };
    expect(showcaseOf(gone, items)?.category).toBe("frame");
  });
});

describe("what the button on an item does", () => {
  const items = buildItems(PRICES);
  const crown = items.find((i) => i.id === "deco-crown")!;
  const halo = items.find((i) => i.id === "deco-halo")!;

  it("wears what is yours right there, and takes off what is on", () => {
    expect(itemAction(crown, { owned: true, native: false })).toEqual({ kind: "wear", column: "avatar_decoration" });
    expect(itemAction(crown, { owned: true, native: false, worn: true })).toEqual({ kind: "wearing", column: "avatar_decoration" });
  });

  it("does not stock chat themes at all", () => {
    expect(items.some((i) => i.id.startsWith("theme-"))).toBe(false);
  });

  it("knows which of the four things each item is", () => {
    const by = (id: string) => items.find((i) => i.id === id)!;
    expect(wornColumn(by("deco-crown"))).toBe("avatar_decoration");
    expect(wornColumn(by("font-script"))).toBe("name_font");
    // A glow is a name item too, worn separately from the face.
    expect(wornColumn(by("glow-lime"))).toBe("name_glow");
    expect(wornColumn(by("bubble-sunset"))).toBe("bubble_style");
    expect(wornColumn(by("plate-aurora"))).toBe("nameplate");
    expect(isWorn(crown, { ...NOTHING_WORN, avatar_decoration: "deco-crown" })).toBe(true);
    expect(isWorn(crown, { ...NOTHING_WORN, avatar_decoration: "deco-halo" })).toBe(false);
  });

  it("sends a Premium item you lack to Premium, in the app too", () => {
    expect(itemAction(halo, { owned: false, native: false })).toEqual({ kind: "premium", href: "/premium" });
    expect(itemAction(halo, { owned: false, native: true })).toEqual({ kind: "premium", href: "/premium" });
  });

  it("sells a priced item on the web, and never inside the Android app", () => {
    expect(itemAction(crown, { owned: false, native: false })).toEqual({ kind: "buy", pricePaise: 4900 });
    expect(itemAction(crown, { owned: false, native: true })).toEqual({ kind: "blocked", why: "app" });
  });

  it("offers no Buy where there is no way to pay", () => {
    expect(itemAction(crown, { owned: false, native: false, configured: false })).toEqual({ kind: "blocked", why: "soon" });
    // What is already yours is still yours to wear.
    expect(itemAction(crown, { owned: true, native: false, configured: false }).kind).toBe("wear");
  });

  it("says why, without pointing anyone in the app at a purchase somewhere else", () => {
    expect(blockedReason("app")).toBe("Not available in the app");
    expect(blockedReason("soon")).toBe("Coming soon");
    // Both stores refuse an app that sends people to buy outside their billing.
    for (const f of ["MarketBrowse.tsx", "MarketPreviewSheet.tsx", "PremiumPlans.tsx"]) {
      const src = readFileSync(`src/components/billing/${f}`, "utf8");
      expect(src, f).not.toMatch(/on the website/i);
      expect(src, f).not.toContain("Payments are coming soon");
    }
  });

  it("does not sell something with no price set", () => {
    const unpriced = { ...crown, pricePaise: undefined };
    expect(itemAction(unpriced, { owned: false, native: false })).toEqual({ kind: "blocked", why: "soon" });
  });
});

describe("the preview's places and its row", () => {
  it("offers only places the item really appears", () => {
    expect(placesFor("frame")).toEqual(["profile", "chat"]);
    expect(placesFor("name")).toEqual(["profile", "feed"]);
    // A nameplate lives in the messages list and nowhere else.
    expect(placesFor("nameplate")).toEqual(["inbox"]);
    expect(placesFor("bubble")).toEqual(["chat"]);
  });

  it("puts the item in the middle of the row, two either side, wrapping round", () => {
    const list = ["a", "b", "c", "d", "e", "f", "g"];
    expect(neighbours(list, 3)).toEqual(["b", "c", "d", "e", "f"]);
    expect(neighbours(list, 0)).toEqual(["f", "g", "a", "b", "c"]);
    expect(neighbours(list, 6)).toEqual(["e", "f", "g", "a", "b"]);
  });

  it("shows a short category once each rather than repeating it", () => {
    expect(neighbours(["a", "b", "c"], 1)).toEqual(["a", "b", "c"]);
    expect(neighbours([], 0)).toEqual([]);
  });
});

describe("the Marketplace pages", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    native.value = false;
    updates.calls.length = 0;
    updates.fail = false;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function category(slug: string, owned: string[] = [], worn: Partial<Worn> = {}) {
    const { MarketBrowse } = await import("@/components/billing/MarketBrowse");
    const page = categoryPage(slug)!;
    const { buildItems } = await import("@/lib/marketplace");
    await act(async () =>
      root.render(
        createElement(MarketBrowse, {
          items: buildItems(PRICES).filter((i) => i.category === page.category),
          columns: page.columns, configured: true, isPremium: false, owned, prices: PRICES, me: ME,
          userId: "me", worn: { ...NOTHING_WORN, ...worn },
        }),
      ),
    );
    return host;
  }
  const click = (el: Element) => act(async () => void (el as HTMLElement).click());
  const tile = (name: string) => [...host.querySelectorAll("li")].find((li) => li.textContent?.includes(name))!;
  const sheet = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label^="Preview of"]');

  /** The front page: everything at once, with the search and the shelves. */
  async function home(owned: string[] = []) {
    const { MarketBrowse } = await import("@/components/billing/MarketBrowse");
    const { buildItems } = await import("@/lib/marketplace");
    await act(async () =>
      root.render(
        createElement(MarketBrowse, {
          items: buildItems(PRICES), columns: 3, browse: true, configured: true, isPremium: false,
          owned, prices: PRICES, me: ME, userId: "me", worn: NOTHING_WORN,
        }),
      ),
    );
  }

  it("opens on the things themselves, not on a card per kind", async () => {
    await home();
    // Every item, of every kind, in one grid.
    const { buildItems } = await import("@/lib/marketplace");
    expect(host.querySelectorAll("li")).toHaveLength(buildItems(PRICES).length);
    expect(host.querySelector('input[aria-label="Search the marketplace"]')).toBeTruthy();
    for (const shelf of ["all", "free", "premium", "yours"]) {
      expect(host.querySelector(`[data-shelf="${shelf}"]`)).toBeTruthy();
    }
  });

  it("still offers the kinds, at the foot, and not chat themes", async () => {
    await home();
    const links = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((h) => h?.startsWith("/marketplace/"));
    expect(links).toEqual(["/marketplace/frames", "/marketplace/bubbles", "/marketplace/names", "/marketplace/nameplates"]);
  });

  /** Type into a controlled input the way React will notice. */
  async function type(box: HTMLInputElement, text: string) {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(box, text);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("the search narrows it, and says so when nothing is left", async () => {
    await home();
    const box = host.querySelector('input[aria-label="Search the marketplace"]') as HTMLInputElement;
    await type(box, "crown");
    const { buildItems: all } = await import("@/lib/marketplace");
    const shown = host.querySelectorAll("li").length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(all(PRICES).length);
    expect(host.textContent).toContain("Crown");
    await type(box, "zzzz");
    expect(host.querySelectorAll("li")).toHaveLength(0);
    expect(host.textContent).toContain("Nothing matches");
  });

  it("Yours shows what you may use, and says so when that is nothing", async () => {
    await home();
    await act(async () => (host.querySelector('[data-shelf="yours"]') as HTMLElement).click());
    // Free things are everyone's, so they count as yours.
    const { buildItems } = await import("@/lib/marketplace");
    const free = buildItems(PRICES).filter((i) => i.tier === "free").length;
    expect(host.querySelectorAll("li")).toHaveLength(free);

    await act(async () => root.unmount());
    root = createRoot(host);
    await home(["deco-crown"]);
    await act(async () => (host.querySelector('[data-shelf="yours"]') as HTMLElement).click());
    expect(host.textContent).toContain("Crown");
  });

  it("lists only that category, three across for frames and two for bubbles", async () => {
    await category("frames");
    expect(host.querySelectorAll("li")).toHaveLength(11);
    expect(host.textContent).toContain("Crown");
    expect(host.textContent).not.toContain("Pond");
    expect(host.querySelector("ul")!.className).toContain("grid-cols-3");
    await act(async () => root.unmount());
    root = createRoot(host);
    await category("bubbles");
    expect(host.querySelector("ul")!.className).toContain("grid-cols-2");
  });

  it("puts a claim button and an eye on every tile", async () => {
    await category("frames", ["deco-crown"]);
    // Yours already: wear it. Priced: its price. With Premium: Claim.
    expect(tile("Crown").querySelector('button[aria-label="Wear Crown"]')!.textContent).toBe("Wear");
    expect(tile("Flames").querySelector('button[aria-label^="Claim Flames"]')!.textContent).toBe("₹49");
    expect(tile("Halo").querySelector("a")!.textContent).toContain("Claim");
    for (const li of host.querySelectorAll("li")) expect(li.querySelector('[aria-label^="Preview "]')).toBeTruthy();
  });

  it("puts an item on right there, without leaving the page", async () => {
    await category("frames", ["deco-crown"]);
    await click(tile("Crown").querySelector('button[aria-label="Wear Crown"]')!);
    expect(updates.calls).toEqual([[{ avatar_decoration: "deco-crown" }, "me"]]);
    // And the button now says it is on.
    expect(tile("Crown").querySelector('[aria-label="Wearing Crown. Take it off"]')).toBeTruthy();
  });

  it("takes off what is on", async () => {
    await category("frames", ["deco-crown"], { avatar_decoration: "deco-crown" });
    await click(tile("Crown").querySelector('[aria-label="Wearing Crown. Take it off"]')!);
    expect(updates.calls).toEqual([[{ avatar_decoration: null }, "me"]]);
    expect(tile("Crown").querySelector('button[aria-label="Wear Crown"]')).toBeTruthy();
  });

  it("puts the button back if it could not be saved", async () => {
    updates.fail = true;
    await category("frames", ["deco-crown"]);
    await click(tile("Crown").querySelector('button[aria-label="Wear Crown"]')!);
    expect(tile("Crown").querySelector('button[aria-label="Wear Crown"]')).toBeTruthy();
    expect(tile("Crown").querySelector('[aria-label^="Wearing"]')).toBeNull();
  });

  it("wears from the preview too, and says so", async () => {
    await category("frames", ["deco-crown"]);
    await click(tile("Crown").querySelector('[aria-label="Preview Crown"]')!);
    const wearIt = [...sheet()!.querySelectorAll("button")].find((b) => b.textContent === "Wear it")!;
    await click(wearIt);
    expect(updates.calls).toEqual([[{ avatar_decoration: "deco-crown" }, "me"]]);
    expect(sheet()!.textContent).toContain("wearing it");
  });

  it("opens the preview from the eye, on you, with the big claim button", async () => {
    await category("frames");
    expect(sheet()).toBeNull();
    await click(tile("Flames").querySelector('[aria-label="Preview Flames"]')!);
    expect(sheet()).toBeTruthy();
    expect(sheet()!.textContent).toContain("Hell yeah, claim it · ₹49");
    expect(sheet()!.textContent).toContain("@naitik");
  });

  it("switches between the places a frame shows, and has no switch for a nameplate", async () => {
    await category("frames");
    await click(tile("Flames").querySelector('[aria-label="Preview Flames"]')!);
    const places = [...sheet()!.querySelectorAll('[aria-label="Where it shows"] button')];
    expect(places.map((b) => b.textContent)).toEqual(["Profile", "In chat"]);
    expect(sheet()!.textContent).toContain("Follow");
    await click(places[1]);
    expect(sheet()!.textContent).not.toContain("Follow");
    expect(sheet()!.textContent).toContain("save me a seat");

    await act(async () => root.unmount());
    root = createRoot(host);
    await category("nameplates");
    await click(host.querySelector('[aria-label^="Preview "]')!);
    expect(sheet()!.querySelector('[aria-label="Where it shows"]')).toBeNull();
  });

  it("moves to another item from the row underneath, without closing", async () => {
    await category("frames");
    await click(tile("Flames").querySelector('[aria-label="Preview Flames"]')!);
    const row = sheet()!.querySelector('[aria-label="More like this"]')!;
    expect(row.querySelector('[aria-current="true"]')!.getAttribute("aria-label")).toBe("Flames");
    await click(row.querySelector('[aria-label="Crown"]')!);
    expect(sheet()!.getAttribute("aria-label")).toBe("Preview of Crown");
  });

  it("sells nothing inside the Android app, but still previews everything", async () => {
    native.value = true;
    await category("frames");
    expect(tile("Flames").querySelector('button[aria-label^="Claim Flames"]')).toBeNull();
    await click(tile("Flames").querySelector('[aria-label="Preview Flames"]')!);
    expect(sheet()!.textContent).not.toContain("claim it · ₹49");
    expect(sheet()!.textContent).toContain("Not available in the app");
    expect(sheet()!.textContent).not.toMatch(/website/i);
  });

  it("closes from the close button", async () => {
    await category("frames");
    await click(tile("Flames").querySelector('[aria-label="Preview Flames"]')!);
    await click(sheet()!.querySelector('[aria-label="Close"]')!);
    expect(sheet()).toBeNull();
  });
});
