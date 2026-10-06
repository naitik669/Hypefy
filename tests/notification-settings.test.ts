// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Settings → Notifications and the Tune sheet edit the same stored choices.
 * They used to describe them differently: three levels there, an on/off
 * switch here, so "Highlights" showed here as plain "on".
 */

const calls = vi.hoisted(() => [] as { fn: string; args: Record<string, unknown> }[]);
const server = vi.hoisted(() => ({ fail: false }));

vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/haptics", () => ({ haptics: { select() {}, tap() {} } }));
vi.mock("@/components/ui/BottomSheet", () => ({ BottomSheet: () => null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return server.fail ? { data: null, error: new Error("no") } : { data: null, error: null };
    },
    from: () => ({ select: () => ({ in: () => ({ then: (r: (v: unknown) => void) => r({ data: [] }) }) }) }),
  }),
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls.length = 0;
  server.fail = false;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

async function open(prefs: Record<string, unknown>) {
  const { NotificationPrefs } = await import("@/components/settings/NotificationPrefs");
  await act(async () => root.render(createElement(NotificationPrefs, { userId: "me", initialPrefs: prefs })));
}
const chosen = (label: string) =>
  host.querySelector(`[role="group"][aria-label="${label}"] [aria-pressed="true"]`)?.textContent;
const choose = (label: string, level: string) =>
  act(async () => {
    const b = [...host.querySelectorAll(`[role="group"][aria-label="${label}"] button`)].find((x) => x.textContent === level);
    (b as HTMLButtonElement).click();
  });

describe("Settings → Notifications", () => {
  it("shows the level each kind is really on, Highlights included", async () => {
    await open({ hypes: "highlights", comments: false });
    expect(chosen("Hypes")).toBe("Highlights");
    expect(chosen("Comments")).toBe("Off");
    expect(chosen("Follows")).toBe("All");
    expect(chosen("Rehypes")).toBe("All");
  });

  it("saves a level through the same door as the Tune sheet", async () => {
    await open({});
    await choose("Rehypes", "Highlights");
    expect(calls).toEqual([{ fn: "set_activity_pref", args: { p_key: "rehypes", p_value: "highlights" } }]);
    expect(chosen("Rehypes")).toBe("Highlights");

    await choose("Rehypes", "Off");
    expect(calls[1].args).toEqual({ p_key: "rehypes", p_value: false });
    // "All" is the absence of a choice, not a stored value.
    await choose("Rehypes", "All");
    expect(calls[2].args).toEqual({ p_key: "rehypes", p_value: null });
  });

  it("puts the level back when the save fails", async () => {
    server.fail = true;
    await open({ hypes: "highlights" });
    await choose("Hypes", "Off");
    expect(chosen("Hypes")).toBe("Highlights");
  });

  it("keeps messages as a switch of its own", async () => {
    await open({});
    const sw = host.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw.getAttribute("aria-checked")).toBe("true");
    await act(async () => sw.click());
    expect(calls).toEqual([{ fn: "set_notif_pref", args: { p_key: "messages", p_on: false } }]);
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });
});
