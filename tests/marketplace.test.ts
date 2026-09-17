// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildItems, filterAndSort, isOwned } from "@/lib/marketplace";

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
    expect(sorted[0].pricePaise).toBe(7900);
    expect(sorted.at(-1)?.pricePaise).toBe(4900);
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
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

describe("the Marketplace page", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render(owned: string[] = []) {
    const { MarketplaceView } = await import("@/components/billing/MarketplaceView");
    await act(async () =>
      root.render(
        createElement(MarketplaceView, {
          configured: true, isPremium: false, owned, prices: PRICES,
          me: { name: "Naitik", avatarUrl: null, hue: 150 },
        }),
      ),
    );
    return host;
  }
  const click = (el: Element) => act(async () => void (el as HTMLElement).click());
  const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

  it("filters the grid by category", async () => {
    await render();
    await click(button("Frames")!);
    const names = [...host.querySelectorAll("li")].map((li) => li.textContent);
    expect(names.length).toBe(11);
    expect(names.some((n) => n?.includes("Crown"))).toBe(true);
    expect(names.some((n) => n?.includes("Pond"))).toBe(false);
  });

  it("marks what you own and prices the rest", async () => {
    await render(["deco-crown"]);
    await click(button("Frames")!);
    const crown = [...host.querySelectorAll("li")].find((li) => li.textContent?.includes("Crown"));
    const flames = [...host.querySelectorAll("li")].find((li) => li.textContent?.includes("Flames"));
    expect(crown?.textContent).toContain("Yours");
    expect(flames?.textContent).toContain("₹49");
  });

  it("shows a picked item on you, with Get on the web and nothing to buy in the app", async () => {
    native.value = false;
    await render();
    await click(button("Flames")!);
    expect(document.body.textContent).toContain("Get · ₹49");
    await act(async () => root.unmount());
    root = createRoot(host);
    native.value = true;
    await render();
    await click(button("Flames")!);
    expect(document.body.textContent).not.toContain("Get · ₹49");
    expect(document.body.textContent).toContain("Not in the app yet");
  });
});
