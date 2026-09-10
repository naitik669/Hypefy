// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The banner as React runs it: that it asks once, that refusing is as easy
 * as accepting, that what you pick is what is stored, that a strict region
 * starts with nothing ticked, and that it can be reopened from elsewhere.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

let root: Root | undefined;
let host: HTMLDivElement;

function clearCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearCookies();
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function render(country: string | null) {
  const { ConsentBanner } = await import("@/components/consent/ConsentBanner");
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConsentBanner, { country })));
}
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const stored = async () => (await import("@/lib/consent")).storedConsent();

describe("ConsentBanner", () => {
  it("asks when nobody has chosen, with Reject and Accept side by side", async () => {
    await render("IN");
    expect(host.textContent).toContain("Your call on cookies");
    const reject = button("Reject all")!;
    const accept = button("Accept all")!;
    expect(reject).toBeTruthy();
    expect(accept).toBeTruthy();
    // Same row, same height: refusing is exactly as easy as agreeing.
    expect(reject.parentElement).toBe(accept.parentElement);
    expect(reject.className).toContain("h-11");
    expect(accept.className).toContain("h-11");
  });

  it("links to the cookie policy", async () => {
    await render("IN");
    expect(host.querySelector('a[href="/cookies"]')).not.toBeNull();
  });

  it("stores a refusal and goes away", async () => {
    await render("IN");
    await act(async () => button("Reject all")!.click());
    expect(await stored()).toMatchObject({ analytics: false, ads: false });
    expect(host.textContent).toBe("");
  });

  it("stores an acceptance and goes away", async () => {
    await render("DE");
    await act(async () => button("Accept all")!.click());
    expect(await stored()).toMatchObject({ analytics: true, ads: true });
    expect(host.textContent).toBe("");
  });

  it("does not ask again once you have chosen", async () => {
    const { saveConsent } = await import("@/lib/consent");
    saveConsent({ analytics: true, ads: false });
    await render("IN");
    expect(host.textContent).toBe("");
  });

  it("starts with nothing ticked where the law requires opt-in", async () => {
    await render("DE");
    await act(async () => button("Choose what to allow")!.click());
    const switches = [...host.querySelectorAll('[role="switch"]')];
    expect(switches).toHaveLength(2);
    for (const s of switches) expect(s.getAttribute("aria-checked")).toBe("false");
  });

  it("saves exactly what was chosen in preferences", async () => {
    await render("DE");
    await act(async () => button("Choose what to allow")!.click());
    const [analytics] = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    await act(async () => analytics.click());
    await act(async () => button("Save choices")!.click());
    expect(await stored()).toMatchObject({ analytics: true, ads: false });
  });

  it("offers no way to dismiss the first ask without answering", async () => {
    await render("IN");
    expect(host.querySelector('[aria-label="Close"]')).toBeNull();
  });

  it("reopens from Settings, showing the current choice, and can be closed", async () => {
    const { saveConsent, openConsentPreferences } = await import("@/lib/consent");
    saveConsent({ analytics: false, ads: true });
    await render("IN");
    expect(host.textContent).toBe("");
    await act(async () => openConsentPreferences());
    expect(host.textContent).toContain("Cookie preferences");
    const [analytics, ads] = [...host.querySelectorAll('[role="switch"]')];
    expect(analytics.getAttribute("aria-checked")).toBe("false");
    expect(ads.getAttribute("aria-checked")).toBe("true");
    await act(async () => (host.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
    expect(host.textContent).toBe("");
  });
});
