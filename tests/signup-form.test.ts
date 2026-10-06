// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MIN_PASSWORD, signupMissing } from "@/lib/signup-check";

/**
 * The sign-up form: a button that says why it is not ready, one password
 * rule for the whole app, and no telling a stranger whether an email address
 * already has an account.
 */

const nav = vi.hoisted(() => ({ pushed: [] as string[] }));
const auth = vi.hoisted(() => ({
  signUps: [] as { email: string; password: string }[],
  result: { data: { user: { id: "u1", identities: [] as unknown[] }, session: null }, error: null } as unknown,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (to: string) => nav.pushed.push(to), refresh() {} }) }));
vi.mock("@/lib/native", () => ({ isNative: () => false }));
vi.mock("@/lib/native-auth", () => ({ startNativeGoogleSignIn: async () => null }));
vi.mock("@/lib/pending-oauth", () => ({ stashPendingOAuth: () => {} }));
vi.mock("@/lib/saved-accounts", () => ({ upsertSavedAccount: () => {} }));
vi.mock("@/lib/e2ee/vault", () => ({ confirmRecovery: async () => true, ensureEncryption: async () => ({ state: "none" }) }));
vi.mock("@/components/e2ee/RecoveryCodeScreen", () => ({ RecoveryCodeScreen: () => null }));
vi.mock("@/components/ui/DateOfBirthPicker", () => ({
  DateOfBirthPicker: (p: { value: string; onChange: (v: string) => void }) =>
    createElement("input", { "data-dob": true, value: p.value, onChange: (e: { target: { value: string } }) => p.onChange(e.target.value) }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signUp: async (a: { email: string; password: string }) => {
        auth.signUps.push({ email: a.email, password: a.password });
        return auth.result;
      },
    },
  }),
}));

const FILLED = { email: "maya@example.test", password: "longenough", dob: "2000-01-01", age: 26, consent: true };

describe("why Create account is not ready", () => {
  it("names one missing thing at a time, in the order the form asks", () => {
    expect(signupMissing({ ...FILLED, email: "" })).toMatch(/email/);
    expect(signupMissing({ ...FILLED, password: "short" })).toBe(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    expect(signupMissing({ ...FILLED, dob: "", age: null })).toMatch(/date of birth/);
    expect(signupMissing({ ...FILLED, consent: false })).toMatch(/Tick the box/);
    expect(signupMissing(FILLED)).toBeNull();
  });

  it("leaves being under 13 to the line that already says it", () => {
    expect(signupMissing({ ...FILLED, age: 11, consent: false })).toBeNull();
  });

  it("holds new passwords to the same length as changed and reset ones", async () => {
    const { readFileSync } = await import("node:fs");
    expect(MIN_PASSWORD).toBe(8);
    expect(readFileSync("src/components/settings/AccountForms.tsx", "utf8")).toContain("newPw.length < 8");
    expect(readFileSync("src/components/auth/ResetPasswordCard.tsx", "utf8")).toContain("password.length < 8");
  });
});

describe("the sign-up form", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    nav.pushed.length = 0;
    auth.signUps.length = 0;
    window.history.replaceState(null, "", "/signup");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  async function open() {
    const { AuthCard } = await import("@/components/auth/AuthCard");
    await act(async () => root.render(createElement(AuthCard, { mode: "signup" } as never)));
  }
  async function fill(selector: string, value: string) {
    const input = host.querySelector(selector) as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const hint = () => host.querySelector("[data-missing]")?.textContent ?? null;
  const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;

  it("says what is still needed, and stops saying it once everything is in", async () => {
    await open();
    expect(submit().disabled).toBe(true);
    expect(hint()).toMatch(/email/);
    await fill('input[type="email"]', "maya@example.test");
    await fill('input[type="password"]', "longenough");
    expect(hint()).toMatch(/date of birth/);
    await fill("[data-dob]", "2000-01-01");
    expect(hint()).toMatch(/Tick the box/);
    await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(hint()).toBeNull();
    expect(submit().disabled).toBe(false);
  });

  it("asks new accounts for eight characters", async () => {
    await open();
    expect((host.querySelector('input[type="password"]') as HTMLInputElement).minLength).toBe(8);
  });

  it("does not tell anyone that an email already has an account", async () => {
    // What the provider returns for an address that is already registered,
    // when it is hiding that fact: a user with no identities, and no email.
    await open();
    await fill('input[type="email"]', "taken@example.test");
    await fill('input[type="password"]', "longenough");
    await fill("[data-dob]", "2000-01-01");
    await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    await act(async () => {
      submit().form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(auth.signUps).toHaveLength(1);
    // The same screen a brand new address gets.
    expect(nav.pushed).toEqual(["/check-email?email=taken%40example.test"]);
    expect(nav.pushed.join("")).not.toContain("exists=1");
    expect(host.textContent).not.toMatch(/already registered/i);
  });
});
