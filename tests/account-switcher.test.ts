// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Settings opens on the account you are using. The four others this phone has
 * signed into are behind one tap, not stacked over the settings themselves.
 */

const ME = { id: "u5", email: "zuck@example.test" };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: { user: ME, access_token: "at", refresh_token: "rt" },
        },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: ME.id,
              display_name: "zuck",
              username: "markzuckerberg",
              avatar_hue: 200,
              avatar_url: null,
            },
          }),
        }),
      }),
    }),
  }),
}));

const SAVED = [
  { userId: "u1", displayName: "hypefy", username: "hypefy.exe" },
  { userId: "u2", displayName: "AMAN", username: "aman.exe" },
  { userId: "u3", displayName: "AMAN", username: "aman" },
  { userId: "u4", displayName: "Naitik Kushwaha", username: "craziematez" },
  { userId: "u5", displayName: "zuck", username: "markzuckerberg" },
].map((a) => ({
  ...a,
  email: `${a.username}@example.test`,
  avatarHue: 200,
  avatarUrl: null,
  accessToken: "at",
  refreshToken: "rt",
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("hypefy_accounts", JSON.stringify(SAVED));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { AccountSwitcher } = await import("@/components/settings/AccountSwitcher");
  await act(async () => root.render(createElement(AccountSwitcher)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
});

const toggle = () =>
  [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Switch account"),
  ) as HTMLButtonElement;
const text = () => host.textContent ?? "";

describe("Accounts in Settings", () => {
  it("shows the account you are on, and only that one", () => {
    expect(text()).toContain("markzuckerberg");
    expect(text()).toContain("Active");
    for (const other of ["hypefy.exe", "aman.exe", "craziematez"]) {
      expect(text()).not.toContain(other);
    }
  });

  it("says how many others there are without listing them", () => {
    expect(toggle()).toBeTruthy();
    expect(toggle().textContent).toContain("4 saved");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    // Adding an account is part of the same job, so it waits there too.
    expect(text()).not.toContain("Add account");
  });

  it("opens the rest on one tap, and closes them again", async () => {
    await act(async () => toggle().click());
    for (const other of ["hypefy.exe", "aman.exe", "aman", "craziematez"]) {
      expect(text()).toContain(other);
    }
    expect(text()).toContain("Add account");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");

    await act(async () => toggle().click());
    expect(text()).not.toContain("hypefy.exe");
    expect(text()).toContain("markzuckerberg");
  });

  it("with nothing else saved, offers Add account outright", async () => {
    await act(async () => root.unmount());
    localStorage.setItem("hypefy_accounts", JSON.stringify([SAVED[4]]));
    root = createRoot(host);
    const { AccountSwitcher } = await import("@/components/settings/AccountSwitcher");
    await act(async () => root.render(createElement(AccountSwitcher)));
    expect(toggle()).toBeFalsy();
    expect(text()).toContain("Add account");
  });
});
