// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Your style: only what you own is on the shelf, picking changes the card
 * but saves nothing, Save sends just the changes, Discard puts it back, and
 * "Wear" from the Marketplace arrives already on the card.
 */

const update = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ update: (patch: unknown) => ({ eq: async () => { update(patch); return { error: null }; } }) }),
  }),
}));

const ME = {
  id: "u1", display_name: "Naitik", username: "craziematez", avatar_url: null, avatar_hue: 150,
  banner_id: "lime-pulse", banner_url: null, is_premium: false, is_verified: false,
  name_font: null, name_glow: null, avatar_decoration: null, bubble_style: null,
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  update.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(props: { owned?: string[]; wear?: string | null; premium?: boolean } = {}) {
  const { StyleEditor } = await import("@/components/billing/StyleEditor");
  await act(async () =>
    root.render(createElement(StyleEditor, { me: { ...ME, is_premium: !!props.premium }, owned: props.owned ?? [], wear: props.wear ?? null })),
  );
}
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text || b.textContent?.includes(text));
const click = (el: Element | undefined) => act(async () => void (el as HTMLElement).click());

describe("Your style", () => {
  it("shelves only what you own", async () => {
    await render({ owned: ["deco-crown"] });
    expect(button("Crown")).toBeTruthy();
    expect(button("Halo")).toBeFalsy();
    expect(button("Flames")).toBeFalsy();
  });

  it("shows Premium items to Premium members", async () => {
    await render({ premium: true });
    expect(button("Halo")).toBeTruthy();
  });

  it("changes the card without saving, then saves only what changed", async () => {
    await render({ owned: ["deco-crown"] });
    expect(host.textContent).toContain("Saved");
    await click(button("Crown"));
    expect(update).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Save change");
    await click(button("Save change"));
    expect(update).toHaveBeenCalledWith({ avatar_decoration: "deco-crown" });
  });

  it("discards back to what was saved", async () => {
    await render({ owned: ["deco-crown"] });
    await click(button("Crown"));
    await click(button("Discard"));
    expect(host.textContent).not.toContain("Save change");
  });

  it("arrives wearing what the Marketplace sent, if you own it", async () => {
    await render({ owned: ["bubble-gold"], wear: "bubble-gold" });
    expect(host.textContent).toContain("Save change");
    await act(async () => root.unmount());
    root = createRoot(host);
    await render({ owned: [], wear: "bubble-gold" });
    expect(host.textContent).not.toContain("Save change");
  });
});
