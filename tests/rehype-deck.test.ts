// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DECK_SEATS, fetchDeck, fetchMe, seatDeck, setRehype, type DeckPerson } from "@/lib/rehype";
import { reconcileFaces } from "@/components/feed/RehypeDeck";

/**
 * The rehype deck: three faces at most, ranked by how much you interact with
 * each person (in the database), and you in the lowest-ranked seat once you
 * rehype. The seating rule is the part most
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
  });

  it("asks for the right function and arguments", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return { data: [], error: null }; } };
    await fetchDeck(db, "shot", "s1");
    expect(calls).toEqual([["rehype_deck", { p_kind: "shot", p_target: "s1" }]]);
  });

  it("fetches your own face once per session, and retries after a failure", async () => {
    let calls = 0;
    let fail = true;
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls++;
              return fail
                ? { data: null, error: { m: 1 } }
                : { data: { display_name: "Crazie", username: "crazie", avatar_url: null, avatar_hue: 90 }, error: null };
            },
          }),
        }),
      }),
    };
    expect(await fetchMe(db, "u-me-1")).toBeNull();
    fail = false;
    const me = await fetchMe(db, "u-me-1");
    expect(me).toMatchObject({ userId: "u-me-1", name: "Crazie", isMe: true });
    await fetchMe(db, "u-me-1");
    expect(calls).toBe(2);
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

type Face = ReturnType<typeof reconcileFaces>[number];
const motions = (fs: Face[]) => fs.map((f) => `${f.person.userId}:${f.seat}:${f.motion}`).join(" ");

describe("reconcileFaces", () => {
  it("rises the row in on its first appearance", () => {
    expect(motions(reconcileFaces([], [A, B]))).toBe("a:0:rise b:1:rise");
  });

  it("never replays a face already on show; only a newcomer pops", () => {
    const idle = reconcileFaces([], [A, B]).map((f) => ({ ...f, motion: "idle" as const }));
    expect(motions(reconcileFaces(idle, [A, B, ME]))).toBe("a:0:idle b:1:idle me:2:pop");
  });

  it("keeps a face that leaves in its seat to pop out, while its replacement pops in", () => {
    const idle = reconcileFaces([], [A, B, ME]).map((f) => ({ ...f, motion: "idle" as const }));
    expect(motions(reconcileFaces(idle, [A, B, C]))).toBe("a:0:idle b:1:idle c:2:pop me:2:leave");
  });

  it("brings a face straight back if it returns while leaving", () => {
    const leaving = reconcileFaces(
      reconcileFaces([], [A, ME]).map((f) => ({ ...f, motion: "idle" as const })),
      [A],
    );
    expect(motions(reconcileFaces(leaving, [A, ME]))).toBe("a:0:idle me:1:pop");
  });

  it("with reduced motion, just shows the seating", () => {
    const idle = reconcileFaces([], [A, ME], true);
    expect(motions(idle)).toBe("a:0:idle me:1:idle");
    expect(motions(reconcileFaces(idle, [A], true))).toBe("a:0:idle");
  });
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function renderDeck(seated: DeckPerson[]) {
  const { RehypeDeck } = await import("@/components/feed/RehypeDeck");
  const draw = (s: DeckPerson[]) => act(async () => root.render(createElement(RehypeDeck, { seated: s })));
  await draw(seated);
  return { draw };
}
const faces = () => [...host.querySelectorAll<HTMLAnchorElement>('[role="group"] a')];
const endAll = () =>
  act(async () => {
    faces().forEach((f) => f.firstElementChild!.dispatchEvent(new Event("animationend", { bubbles: true })));
  });

describe("RehypeDeck", () => {
  it("draws nothing when nobody rehyped it", async () => {
    await renderDeck([]);
    expect(host.innerHTML).toBe("");
  });

  it("shows each seated face, named for screen readers, each opening a profile", async () => {
    await renderDeck([A, B, ME]);
    expect(faces()).toHaveLength(3);
    expect(host.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Rehyped by A, B, you");
    expect(faces()[2].getAttribute("aria-label")).toBe("You rehyped this");
    expect(faces().map((f) => f.getAttribute("href"))).toEqual(["/u/a", "/u/b", "/profile"]);
  });

  it("keeps faces bare: no name tag on you, and one rehype mark for the whole row", async () => {
    await renderDeck([A, B, ME]);
    const group = host.querySelector('[role="group"]')!;
    // Only the avatars' own initials — no "You" tag on top of yours.
    expect(group.textContent).toBe("ABM");
    expect(group.querySelectorAll("svg")).toHaveLength(1);
    expect(faces()[0].querySelector("svg")).not.toBeNull();
  });

  it("seats you on the very next render when you rehype — nothing waits", async () => {
    const { draw } = await renderDeck([A, B, C]);
    await endAll();
    await draw([A, B, ME]);
    const live = faces().filter((f) => f.getAttribute("aria-hidden") !== "true");
    expect(live.map((f) => f.getAttribute("aria-label")!.split(" ")[0])).toEqual(["A", "B", "You"]);
  });

  it("rises in once, then only a face that joins later animates", async () => {
    const { draw } = await renderDeck([A, B]);
    const motion = () => faces().map((f) => (f.firstElementChild as HTMLElement).style.animation);
    expect(motion().every((m) => m.startsWith("deck-rise"))).toBe(true);
    await endAll();
    expect(motion()).toEqual(["", ""]);
    await draw([A, B, ME]);
    const [a, b, me] = motion();
    expect([a, b]).toEqual(["", ""]);
    expect(me).toMatch(/^deck-pop-in /);
  });

  it("removes a face that left once its exit has played", async () => {
    const { draw } = await renderDeck([A, B, ME]);
    await endAll();
    await draw([A, B, C]);
    expect(faces()).toHaveLength(4);
    await endAll();
    expect(faces().map((f) => f.getAttribute("aria-label")!.split(" ")[0])).toEqual(["A", "B", "C"]);
  });
});
