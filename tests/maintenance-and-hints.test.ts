// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { maintenanceAnswer, maintenanceOn } from "@/lib/maintenance";

/**
 * "Back soon" when Hypefy is down on purpose, and the one-at-a-time tips a
 * new person sees.
 */

describe("maintenance mode", () => {
  it("is off unless it is switched on, exactly", () => {
    expect(maintenanceOn({})).toBe(false);
    expect(maintenanceOn({ MAINTENANCE_MODE: "off" })).toBe(false);
    expect(maintenanceOn({ MAINTENANCE_MODE: "1" })).toBe(false);
    expect(maintenanceOn({ MAINTENANCE_MODE: "on" })).toBe(true);
  });

  it("shows the screen for pages and answers 503-style for the API", () => {
    for (const p of ["/", "/home", "/shots", "/messages/abc", "/u/maya", "/settings/account"]) {
      expect(maintenanceAnswer(p)).toBe("page");
    }
    for (const p of ["/api/push", "/api/music", "/api/account/delete"]) {
      expect(maintenanceAnswer(p)).toBe("api");
    }
  });

  it("keeps up what people are owed regardless", () => {
    for (const p of ["/privacy", "/terms", "/guidelines", "/cookies", "/delete-account", "/child-safety", "/maintenance"]) {
      expect(maintenanceAnswer(p)).toBe("pass");
    }
  });

  it("keeps up the files the screen itself needs, and the app's version check", () => {
    for (const p of ["/_next/static/chunks/x.js", "/icons/icon-192.png", "/favicon.ico", "/offline.html", "/api/version"]) {
      expect(maintenanceAnswer(p)).toBe("pass");
    }
  });

  it("is decided before anything reaches the database", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy.indexOf("if (maintenanceOn())")).toBeGreaterThan(0);
    expect(proxy.indexOf("if (maintenanceOn())")).toBeLessThan(proxy.indexOf("isGateDisabled()"));
    expect(proxy.indexOf("if (maintenanceOn())")).toBeLessThan(proxy.indexOf("await updateSession(request)"));
    expect(proxy).toContain('NextResponse.rewrite(new URL("/maintenance", request.url)');
    expect(proxy).toContain("status: 503");
  });

  it("the screen needs no session and no database", () => {
    const page = readFileSync("src/app/maintenance/page.tsx", "utf8");
    expect(page).not.toMatch(/supabase|createClient|cookies\(\)/);
    expect(page).toContain("Back soon");
  });
});

describe("first-run tips", () => {
  let root: Root;
  let host: HTMLDivElement;
  const HINTS = [
    { id: "one", title: "First", text: "a" },
    { id: "two", title: "Second", text: "b" },
  ];

  async function mount() {
    const { FeatureHints } = await import("@/components/ui/FeatureHint");
    await act(async () => root.render(createElement(FeatureHints, { hints: HINTS })));
    await act(async () => void vi.advanceTimersByTime(5));
  }
  const dismiss = () => act(async () => (host.querySelector('[aria-label="Got it"]') as HTMLButtonElement).click());

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("shows one tip, the first", async () => {
    await mount();
    expect(host.textContent).toContain("First");
    expect(host.textContent).not.toContain("Second");
  });

  it("does not bring on the next tip the moment one is closed", async () => {
    await mount();
    await dismiss();
    expect(host.textContent).toBe("");
    expect(localStorage.getItem("hypefy_hint_one")).toBe("1");
  });

  it("shows the next one on the next visit, and nothing once all are read", async () => {
    localStorage.setItem("hypefy_hint_one", "1");
    await mount();
    expect(host.textContent).toContain("Second");
    await dismiss();
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount();
    expect(host.textContent).toBe("");
  });

  it("Home and Messages each explain what nothing else does", () => {
    const home = readFileSync("src/app/(app)/home/page.tsx", "utf8");
    for (const id of ['id: "shows"', 'id: "hype"', 'id: "hold"']) expect(home).toContain(id);
    expect(readFileSync("src/app/(app)/messages/(inbox)/page.tsx", "utf8")).toContain('id: "spotlight"');
  });
});
