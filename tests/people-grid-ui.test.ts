// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PeopleSuggestion } from "@hypefy/core/people-rank";

/**
 * The People grid as someone uses it: pages of four, ✕ to hide someone for
 * good on this device, and an honest end when there is nobody left.
 */

vi.mock("@/components/profile/FollowButton", () => ({
  FollowButton: ({ targetUserId }: { targetUserId: string }) =>
    createElement("button", { "data-follow": targetUserId }, "Follow"),
}));
vi.mock("@/components/ui/Avatar", () => ({
  Avatar: ({ name }: { name: string }) => createElement("span", { "data-avatar": name }),
}));

let root: Root;
let host: HTMLDivElement;

function suggestion(id: string, extra: Partial<PeopleSuggestion> = {}): PeopleSuggestion {
  return {
    id,
    name: id,
    username: id,
    avatar_hue: 1,
    avatar_url: null,
    verified: false,
    accent: "#a3e635",
    reason: "Say hi first",
    mutuals: [],
    score: 0,
    ...extra,
  };
}
const eleven = Array.from({ length: 11 }, (_, i) => suggestion(`p${i}`));

async function mount(people: PeopleSuggestion[]) {
  const { PeopleGrid } = await import("@/components/people/PeopleGrid");
  await act(async () => root.render(createElement(PeopleGrid, { people })));
}
const tiles = () => [...host.querySelectorAll("article")];
const pages = () => [...host.querySelectorAll('[role="group"]')];
const names = () => tiles().map((t) => t.querySelector("[data-follow]")!.getAttribute("data-follow"));
async function click(el: Element) {
  await act(async () => void (el as HTMLElement).click());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("PeopleGrid", () => {
  it("lays eleven people out as pages of four, with one dot per page", async () => {
    await mount(eleven);
    expect(pages().map((p) => p.querySelectorAll("article").length)).toEqual([4, 4, 3]);
    expect(host.querySelectorAll('button[aria-label^="Go to page"]')).toHaveLength(3);
  });

  it("no dots when it all fits on one page", async () => {
    await mount(eleven.slice(0, 3));
    expect(host.querySelectorAll('button[aria-label^="Go to page"]')).toHaveLength(0);
  });

  it("each tile says who, why, and who you know that follows them", async () => {
    await mount([
      suggestion("spidey", {
        name: "Spidey",
        reason: "2 mutuals",
        mutuals: [
          { id: "a", name: "Anup", avatar_hue: 1, avatar_url: null },
          { id: "k", name: "Kurkure", avatar_hue: 2, avatar_url: null },
        ],
      }),
    ]);
    const t = tiles()[0];
    expect(t.textContent).toContain("Spidey");
    expect(t.textContent).toContain("2 mutuals");
    expect([...t.querySelectorAll("[data-avatar]")].map((a) => a.getAttribute("data-avatar"))).toEqual([
      "Spidey",
      "Anup",
      "Kurkure",
    ]);
    expect(t.querySelector('a[href="/u/spidey"]')).not.toBeNull();
  });

  it("✕ hides that person, the next one moves up, and it is remembered", async () => {
    await mount(eleven);
    await click(host.querySelector('button[aria-label="Hide p1"]')!);
    expect(names().slice(0, 4)).toEqual(["p0", "p2", "p3", "p4"]);
    expect(JSON.parse(window.localStorage.getItem("hypefy:people-hidden")!)).toEqual(["p1"]);

    await act(async () => root.unmount());
    root = createRoot(host);
    await mount(eleven);
    expect(names()).not.toContain("p1");
  });

  it("hiding everyone ends honestly, and the people you hid can come back", async () => {
    await mount(eleven.slice(0, 2));
    await click(host.querySelector('button[aria-label="Hide p0"]')!);
    await click(host.querySelector('button[aria-label="Hide p1"]')!);
    expect(tiles()).toHaveLength(0);
    expect(host.textContent).toContain("You've seen everyone for now");
    const back = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Show the"))!;
    expect(back.textContent).toBe("Show the 2 you hid");
    await click(back);
    expect(names()).toEqual(["p0", "p1"]);
  });

  it("a stored list that is not a list is ignored rather than thrown on", async () => {
    window.localStorage.setItem("hypefy:people-hidden", "{not json");
    await mount(eleven.slice(0, 2));
    expect(names()).toEqual(["p0", "p1"]);
  });

  it("and so is valid JSON that is not a list of ids", async () => {
    window.localStorage.setItem("hypefy:people-hidden", JSON.stringify({ p0: true }));
    await mount(eleven.slice(0, 2));
    expect(names()).toEqual(["p0", "p1"]);
    window.localStorage.setItem("hypefy:people-hidden", JSON.stringify(["p0", 7]));
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount(eleven.slice(0, 2));
    expect(names()).toEqual(["p1"]);
    // Only real ids count as people you hid.
    await click(host.querySelector('button[aria-label="Hide p1"]')!);
    const back = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Show the"))!;
    expect(back.textContent).toBe("Show the 2 you hid");
  });

  it("swiping is scrolling: the track has no handler that could follow anyone", async () => {
    await mount(eleven);
    const track = pages()[0].parentElement!;
    expect(track.className).toContain("snap-x");
    expect(track.className).toContain("overflow-x-auto");
    // Follow lives only in the tile's FollowButton: one per tile, nowhere else.
    expect(host.querySelectorAll("[data-follow]")).toHaveLength(11);
  });
});
