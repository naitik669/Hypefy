// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Hypers and Favourites were two private lists of people with nearly the same
 * purpose. They are one list now: Hypers. Nothing in the app offers a second
 * one, and an old link to it lands on the one that is left.
 */

const redirect = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ feed: null as string | null }));

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  usePathname: () => "/home",
  useSearchParams: () => ({ get: (k: string) => (k === "feed" ? params.feed : null), toString: () => "" }),
}));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/haptics", () => ({ haptics: { select() {}, tap() {}, success() {} } }));
vi.mock("@/lib/supabase/client", () => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null });
  return { createClient: () => ({ from: () => q, rpc: async () => ({ error: null }) }) };
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  redirect.mockReset();
  params.feed = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("one private list", () => {
  it("offers Hypers on a profile, and no second list", async () => {
    const { HyperFavoriteButton } = await import("@/components/profile/HyperFavoriteButton");
    await act(async () =>
      root.render(
        createElement(HyperFavoriteButton, { currentUserId: "me", targetUserId: "u2", targetUsername: "maya", initialHyper: false }),
      ),
    );
    await act(async () => (host.querySelector('[aria-label="More options"]') as HTMLButtonElement).click());
    expect(document.body.textContent).toContain("Hypers");
    expect(document.body.textContent).not.toMatch(/favourite/i);
  });

  it("sends an old Favourites link to Hypers", async () => {
    const { default: FavouritesPage } = await import("@/app/(app)/favourites/page");
    FavouritesPage();
    expect(redirect).toHaveBeenCalledWith("/hypers");
  });

  it("falls back to For You for an old Favourites feed link", async () => {
    params.feed = "favourite";
    const { useFeedTab } = await import("@/components/layout/FeedTabDropdown");
    let tab = "";
    function Probe() {
      tab = useFeedTab();
      return null;
    }
    await act(async () => root.render(createElement(Probe)));
    expect(tab).toBe("foryou");

    params.feed = "hypers";
    await act(async () => root.render(createElement(Probe)));
    expect(tab).toBe("hypers");
  });
});
