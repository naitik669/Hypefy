// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The Shop sells what the catalogue prices, shows what you own as yours,
 * and has nothing to buy inside the Android app.
 */

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/native", () => ({ isNative: () => native.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

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
  const { ShopGrid } = await import("@/components/billing/ShopGrid");
  await act(async () =>
    root.render(
      createElement(ShopGrid, {
        configured: true,
        isPremium: false,
        owned,
        prices: { "deco-flames": 4900, "deco-crown": 4900, "deco-hearts": 4900, "theme-arcade": 7900, "theme-candy": 7900 },
        me: { name: "Naitik", avatarUrl: null, hue: 150 },
      }),
    ),
  );
  return host;
}

describe("the Shop", () => {
  it("prices items from the catalogue and marks what you own", async () => {
    native.value = false;
    const el = await render(["deco-crown"]);
    const buttons = [...el.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(buttons).toContain("Buy Flames for ₹49");
    expect(buttons).toContain("Buy Arcade for ₹79");
    expect(buttons).not.toContain("Buy Crown for ₹49");
    expect(el.textContent).toContain("Wear");
  });

  it("offers Premium items through Premium, not for sale", async () => {
    native.value = false;
    const el = await render();
    expect([...el.querySelectorAll("button")].some((b) => b.getAttribute("aria-label")?.includes("Pond"))).toBe(false);
    expect(el.querySelector('a[href="/premium"]')).not.toBeNull();
  });

  it("has nothing to buy inside the app", async () => {
    native.value = true;
    const el = await render();
    expect(el.querySelectorAll('button[aria-label^="Buy"]').length).toBe(0);
    expect(el.textContent).toContain("Not in the app yet");
  });
});
