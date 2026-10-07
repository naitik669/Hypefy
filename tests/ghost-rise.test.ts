// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

/**
 * Hyping something that was Ghost Shared to you lets a ghost out: once, for
 * a moment, and only when the database says this one was placed for you.
 */

const rpc = vi.hoisted(() => vi.fn());
const buzz = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/haptics", () => ({ haptics: { select: buzz } }));

let root: Root;
let host: HTMLDivElement;
let ask: () => Promise<void>;

async function mount(kind: "post" | "shot" = "shot", id = "s1") {
  const { useGhostRise, GhostRise } = await import("@/components/ghost/GhostRise");
  function Star() {
    const ghost = useGhostRise(kind, id);
    ask = ghost.ask;
    return createElement("span", { className: "relative" }, ghost.rising ? createElement(GhostRise) : null);
  }
  await act(async () => root.render(createElement(Star)));
}
const ghost = () => host.querySelector("[data-ghost-rise]");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  rpc.mockReset();
  buzz.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("the ghost on a hype", () => {
  it("shows nothing until it is asked", async () => {
    await mount();
    expect(ghost()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks about the thing that was hyped", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await mount("post", "p7");
    await act(async () => ask());
    expect(rpc).toHaveBeenCalledWith("ghost_hype_reveal", { p_kind: "post", p_content_id: "p7" });
  });

  it("rises when the database says this was placed for you, then is gone", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { GHOST_RISE_MS } = await import("@/components/ghost/GhostRise");
    await mount();
    await act(async () => ask());
    expect(ghost()).toBeTruthy();
    expect(buzz).toHaveBeenCalledTimes(1);
    await act(async () => void vi.advanceTimersByTime(GHOST_RISE_MS - 10));
    expect(ghost()).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(20));
    expect(ghost()).toBeNull();
  });

  it("stays away for an ordinary hype", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await mount();
    await act(async () => ask());
    expect(ghost()).toBeNull();
    expect(buzz).not.toHaveBeenCalled();
  });

  it("stays away when there is no answer, or one that is not a plain yes", async () => {
    await mount();
    for (const answer of [{ data: null, error: { message: "offline" } }, { data: null, error: null }, { data: "true", error: null }]) {
      rpc.mockResolvedValue(answer);
      await act(async () => ask());
      expect(ghost()).toBeNull();
    }
  });

  it("is not something a screen reader announces, and never takes a tap", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await mount();
    await act(async () => ask());
    expect(ghost()!.getAttribute("aria-hidden")).toBe("true");
    expect(ghost()!.className).toContain("pointer-events-none");
  });

  it("is a see-through shape with no face: one path, fading out toward the hem", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await mount();
    await act(async () => ask());
    const svg = ghost()!.querySelector("svg")!;
    expect(svg.querySelectorAll("path, circle, ellipse, line, rect")).toHaveLength(1);
    const stops = [...svg.querySelectorAll("stop")].map((s) => Number(s.getAttribute("stop-opacity")));
    expect(stops[0]).toBeLessThan(1);
    expect(stops[stops.length - 1]).toBe(0);
    expect(svg.querySelector("path")!.getAttribute("fill")).toBe(`url(#${svg.querySelector("linearGradient")!.id})`);
  });
});

describe("where it is wired", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it.each([
    ["src/components/shots/ReelsFeed.tsx", 'useGhostRise("shot", reel.id)'],
    ["src/components/feed/ShotFeedCard.tsx", 'useGhostRise("shot", shot.id)'],
    ["src/components/feed/FeedCard.tsx", 'useGhostRise("post", post.id)'],
  ])("%s asks only after a hype that was given, not one taken back", (file, hook) => {
    const src = read(file);
    expect(src).toContain(hook);
    expect(src).toContain("if (res ? res.hyped : !prev) void ghostRise.ask();");
    expect(src).toContain("{ghostRise.rising && <GhostRise");
  });

  it("lasts as long in the stylesheet as it does in the component", async () => {
    const { GHOST_RISE_MS } = await import("@/components/ghost/GhostRise");
    expect(read("src/app/globals.css")).toMatch(new RegExp(`animation: ghost-up ${GHOST_RISE_MS / 1000}s[^;]*;[\\s\\S]*animation: ghost-sway ${GHOST_RISE_MS / 1000}s[\\s\\S]*animation: ghost-mist ${GHOST_RISE_MS / 1000}s`));
  });
});
