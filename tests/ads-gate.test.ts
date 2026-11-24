// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.hypefy.chat/" }
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The one ad case that could never be reached before.
 *
 * tests/ad-slots-hook covers the hook's shape, and it mocked isNative() to
 * false — so the branch that matters for a store submission, a client where
 * AdSense may not run, was never rendered. Two things made it unreachable:
 * the gate was a platform check that jsdom can only answer one way, and
 * `canServeHere()` returns false on localhost, which forces the house card
 * regardless and would have made the test pass for the wrong reason.
 *
 * Its own file, because the fix for the second is the jsdom URL above and
 * that is a per-file setting. Everything else in the chain is real: the real
 * registry, the real adFill, the real hook.
 */

/** Drives which environment the registry is resolved against. */
const blocked = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/use-feature", async () => {
  const { verdictHere } = await import("./helpers/feature-seam");
  return { useFeature: (id: Parameters<typeof verdictHere>[0]) => verdictHere(id, blocked.value) };
});
vi.mock("@/lib/consent", () => ({
  consentRevision: () => 0,
  subscribeConsent: () => () => {},
  currentConsent: () => ({ ads: true }),
}));

const ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = {
    ...ENV,
    NEXT_PUBLIC_ADS_MODE: "adsense",
    NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-0000000000000000",
    NEXT_PUBLIC_ADSENSE_FEED_SLOT: "1234567890",
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  process.env = { ...ENV };
  document.body.innerHTML = "";
  blocked.value = false;
});

async function fillFor(country: string): Promise<string> {
  const { useAdFill } = await import("@/components/feed/useAdSlots");
  const Probe = () => createElement("i", { id: "fill" }, useAdFill(country));
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(Probe));
  });
  const text = host.querySelector("#fill")?.textContent ?? "";
  await act(async () => root?.unmount());
  return text;
}

describe("whether a real ad is served", () => {
  it("serves one on the live site, with consent, outside the EEA", async () => {
    // The control. Without it a mistake anywhere in the chain makes the next
    // assertion pass for the wrong reason — which is how this branch went
    // uncovered in the first place.
    expect(await fillFor("US")).toBe("adsense");
  });

  it("serves the house card instead where the registry forbids ads", async () => {
    /*
     * AdSense's terms bar it from an app WebView, which is policy rather than
     * a fact about the device — so the answer comes from the registry's `ads`
     * entry and holds for every client at once.
     *
     * "house" rather than "off": the slot still shows Hypefy's own card, so
     * the layout is unchanged and only the network request is gone.
     */
    blocked.value = true;
    expect(await fillFor("US")).toBe("house");
  });
});
