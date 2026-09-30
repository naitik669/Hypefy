// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, createRef, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DECK_SEATS, fetchDeck, fetchRoute, routeStops, seatDeck, setRehype, type DeckPerson } from "@/lib/rehype";
import type { RehypeDeckHandle } from "@/components/feed/RehypeDeck";

/**
 * The rehype deck: three faces at most, ranked by how much you interact with
 * each person (in the database), you in the lowest-ranked seat once you
 * rehype, and a relay route behind a tap. The seating rule is the part most
 * likely to drift — it decides whether a rehype moves one face or all of them.
 */

const person = (id: string, isMe = false): DeckPerson => ({
  userId: id,
  name: id.toUpperCase(),
  username: id,
  avatarUrl: null,
  hue: 200,
  isMe,
});
const A = person("a"), B = person("b"), C = person("c"), D = person("d"), ME = person("me", true);
const ids = (xs: DeckPerson[]) => xs.map((x) => x.userId).join(",");

describe("seatDeck — who sits where", () => {
  it("never shows more than three", () => {
    expect(DECK_SEATS).toBe(3);
    expect(ids(seatDeck([A, B, C, D], null, false))).toBe("a,b,c");
  });

  it("gives you the lowest-ranked seat on show — only that seat changes", () => {
    const before = seatDeck([A, B, C], ME, false);
    const after = seatDeck([A, B, C], ME, true);
    expect(ids(before)).toBe("a,b,c");
    expect(ids(after)).toBe("a,b,me");
    // The first two seats are untouched, so nothing else in the row moves.
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
  });

  it("with room to spare, you just join the end", () => {
    expect(ids(seatDeck([A], ME, true))).toBe("a,me");
    expect(ids(seatDeck([], ME, true))).toBe("me");
  });

  it("does not seat you before your own row has arrived", () => {
    expect(ids(seatDeck([A, B, C], null, true))).toBe("a,b,c");
  });

  it("gives the displaced face its seat back when you undo", () => {
    expect(ids(seatDeck([A, B, C], ME, false))).toBe("a,b,c");
  });
});

describe("routeStops", () => {
  it("places one stop per person, inside the photo", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const stops = routeStops(n);
      expect(stops).toHaveLength(n);
      for (const s of stops) {
        expect(s.x).toBeGreaterThan(0.05);
        expect(s.x).toBeLessThan(0.95);
        expect(s.y).toBeGreaterThan(0.05);
        expect(s.y).toBeLessThan(0.95);
      }
    }
    expect(routeStops(0)).toEqual([]);
  });

  it("runs from the top-right towards the bottom-left, so it reads as travelling to you", () => {
    const s = routeStops(4);
    expect(s[0].x).toBeGreaterThan(s[3].x);
    expect(s[0].y).toBeLessThan(s[3].y);
  });
});

describe("fetching", () => {
  const rows = [
    { user_id: "me", display_name: "Me", username: "me", avatar_url: null, avatar_hue: 10, is_me: true },
    { user_id: "a", display_name: null, username: "aman", avatar_url: "x.png", avatar_hue: null, is_me: false },
  ];

  it("puts the others in rank order, whatever order the rows arrive in", async () => {
    const unordered = [
      { user_id: "c", display_name: "C", username: "c", avatar_url: null, avatar_hue: 1, is_me: false, rank: 3 },
      { user_id: "a", display_name: "A", username: "a", avatar_url: null, avatar_hue: 1, is_me: false, rank: 1 },
      { user_id: "me", display_name: "Me", username: "me", avatar_url: null, avatar_hue: 1, is_me: true, rank: 0 },
      { user_id: "b", display_name: "B", username: "b", avatar_url: null, avatar_hue: 1, is_me: false, rank: 2 },
    ];
    const deck = await fetchDeck({ rpc: async () => ({ data: unordered, error: null }) }, "post", "p1");
    expect(deck.others.map((o) => o.userId)).toEqual(["a", "b", "c"]);
    expect(deck.me?.userId).toBe("me");
  });

  it("splits you from the others, and falls back sensibly on missing fields", async () => {
    const db = { rpc: async () => ({ data: rows, error: null }) };
    const deck = await fetchDeck(db, "post", "p1");
    expect(deck.me?.userId).toBe("me");
    expect(deck.me?.isMe).toBe(true);
    expect(deck.others).toHaveLength(1);
    expect(deck.others[0]).toMatchObject({ name: "aman", hue: 200, avatarUrl: "x.png", isMe: false });
  });

  it("is empty, never throwing, when the call fails", async () => {
    expect(await fetchDeck({ rpc: async () => ({ data: null, error: { m: 1 } }) }, "post", "p")).toEqual({ others: [], me: null });
    expect(await fetchDeck({ rpc: () => Promise.reject(new Error("net")) }, "post", "p")).toEqual({ others: [], me: null });
    expect(await fetchRoute({ rpc: () => Promise.reject(new Error("net")) }, "post", "p", "a")).toEqual([]);
  });

  it("marks you on the route by id, since route rows carry no is_me", async () => {
    const route = [
      { user_id: "a", display_name: "A", username: "a", avatar_url: null, avatar_hue: 1 },
      { user_id: "me", display_name: "Me", username: "me", avatar_url: null, avatar_hue: 2 },
    ];
    const got = await fetchRoute({ rpc: async () => ({ data: route, error: null }) }, "post", "p", "me", "me");
    expect(got.map((p) => p.isMe)).toEqual([false, true]);
  });

  it("asks for the right function and arguments", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return { data: [], error: null }; } };
    await fetchDeck(db, "shot", "s1");
    await fetchRoute(db, "post", "p1", "u1");
    expect(calls).toEqual([
      ["rehype_deck", { p_kind: "shot", p_target: "s1" }],
      ["rehype_route", { p_kind: "post", p_target: "p1", p_from: "u1" }],
    ]);
  });
});

describe("setRehype records who it came from", () => {
  function recorder() {
    const rows: Record<string, string>[] = [];
    const db = {
      from: () => ({
        insert: (row: Record<string, string>) => { rows.push(row); return Promise.resolve({ error: null }); },
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
      }),
    };
    return { db, rows };
  }

  it("passes the via link through", async () => {
    const { db, rows } = recorder();
    await setRehype(db, "me", "post", "p1", true, "a");
    expect(rows[0]).toEqual({ user_id: "me", post_id: "p1", via_user_id: "a" });
  });

  it("leaves it out when there is none, or when it would be yourself", async () => {
    const { db, rows } = recorder();
    await setRehype(db, "me", "post", "p1", true, null);
    await setRehype(db, "me", "post", "p2", true, "me");
    await setRehype(db, "me", "post", "p3", true);
    expect(rows.every((r) => !("via_user_id" in r))).toBe(true);
  });
});

// ── the component ─────────────────────────────────────────────────────────

type RouteLoader = (tapped: DeckPerson) => Promise<{ people: DeckPerson[]; endsAtYou: boolean }>;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

async function renderDeck(
  seated: DeckPerson[],
  loadRoute = vi.fn<RouteLoader>(async () => ({ people: [A, B], endsAtYou: true })),
) {
  const { RehypeDeck } = await import("@/components/feed/RehypeDeck");
  const ref = createRef<RehypeDeckHandle>();
  const draw = (s: DeckPerson[]) =>
    act(async () => root.render(createElement(RehypeDeck, { ref, seated: s, authorName: "crazie", loadRoute })));
  await draw(seated);
  return { ref, loadRoute, draw };
}
const faces = () => [...host.querySelectorAll<HTMLButtonElement>('[role="group"] button')];
const routeLayer = () => host.querySelector<HTMLButtonElement>('button[aria-label^="How this reached you"]');

describe("RehypeDeck", () => {
  it("draws nothing when nobody you follow rehyped it", async () => {
    await renderDeck([]);
    expect(host.innerHTML).toBe("");
  });

  it("shows each seated face, named for screen readers", async () => {
    await renderDeck([A, B, ME]);
    expect(faces()).toHaveLength(3);
    expect(host.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Rehyped by A, B, you");
    expect(faces()[2].getAttribute("aria-label")).toMatch(/^You rehyped this/);
  });

  it("asks for the route to the face that was tapped, not a guess", async () => {
    const { loadRoute } = await renderDeck([B, A]);
    await act(async () => faces()[1].click());
    expect(loadRoute).toHaveBeenCalledTimes(1);
    expect(loadRoute.mock.calls[0][0].userId).toBe("a");
  });

  it("opens the route on a tap: loads it, then spells out the chain from the author to you", async () => {
    const { loadRoute } = await renderDeck([B, A]);
    await act(async () => faces()[0].click());
    expect(loadRoute).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(250); });
    const layer = routeLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getAttribute("aria-label")).toBe("How this reached you: crazie, then A, then B, then you. Tap to close");
  });

  it("closes the route by itself after the hold, and the row comes back", async () => {
    await renderDeck([B, A]);
    await act(async () => faces()[0].click());
    await act(async () => { vi.advanceTimersByTime(250 + 1300 + 500 + 400); });
    expect(routeLayer()).toBeNull();
    expect(faces()).toHaveLength(2);
  });

  it("ignores taps while the route is playing, so it can't stack", async () => {
    const { loadRoute } = await renderDeck([B, A]);
    await act(async () => faces()[0].click());
    await act(async () => faces()[1]?.click());
    expect(loadRoute).toHaveBeenCalledTimes(1);
  });

  it("does nothing with an empty route, and stays usable", async () => {
    const empty = vi.fn<RouteLoader>(async () => ({ people: [], endsAtYou: true }));
    await renderDeck([A], empty);
    await act(async () => faces()[0].click());
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(routeLayer()).toBeNull();
    await act(async () => faces()[0].click());
    expect(empty).toHaveBeenCalledTimes(2);
  });

  it("plays your rehype's route, then seats you where the parent says", async () => {
    const { ref, draw } = await renderDeck([A, B, C]);
    await act(async () => ref.current!.playRehype([A, ME]));
    // The parent updates the seating while the route is playing...
    await draw([A, B, ME]);
    // ...and in the moment before the route appears, while the old faces pop
    // out, you must not already be bubbling into the row.
    expect(faces().some((f) => f.getAttribute("aria-label")!.startsWith("You"))).toBe(false);
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(routeLayer()!.getAttribute("aria-label")).toContain("then you");
    // ...and the row only changes once the route has gone.
    await act(async () => { vi.advanceTimersByTime(1300 + 500 + 400); });
    expect(routeLayer()).toBeNull();
    expect(faces().map((f) => f.getAttribute("aria-label")!.split(" ")[0])).toEqual(["A", "B", "You"]);
  });

  it("swaps only your seat back on undo", async () => {
    const { ref, draw } = await renderDeck([A, B, ME]);
    await act(async () => ref.current!.undo());
    await draw([A, B, C]);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(faces().map((f) => f.getAttribute("aria-label")!.split(" ")[0])).toEqual(["A", "B", "C"]);
  });
});
