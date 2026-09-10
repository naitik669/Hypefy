// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Pin } from "@/components/discover/PinFeed";

/**
 * Discover's feed as React runs it. Discover needs a session the preview
 * cannot sign in with, so the behaviour that matters — it loads by itself,
 * reads on from the right place, never moves what is already on screen,
 * stops at the end, and cannot get stuck — is checked here instead.
 */

// ── A controllable IntersectionObserver ────────────────────────────────────
type IO = { cb: IntersectionObserverCallback; el: Element | null; live: boolean };
let observers: IO[] = [];
class FakeIO {
  private rec: IO;
  constructor(cb: IntersectionObserverCallback) {
    this.rec = { cb, el: null, live: true };
    observers.push(this.rec);
  }
  observe(el: Element) {
    this.rec.el = el;
  }
  disconnect() {
    this.rec.live = false;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}
async function nearBottom() {
  const live = observers.filter((o) => o.live && o.el);
  const o = live[live.length - 1];
  await act(async () => {
    o?.cb([{ isIntersecting: true } as IntersectionObserverEntry], o as never);
  });
  // Let the fetch promise and its state updates settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ── A controllable database ────────────────────────────────────────────────
let pages: Pin[][] = [];
let queries: { lt: string | null }[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const q: { lt: string | null } = { lt: null };
      const b = {
        select: () => b,
        neq: () => b,
        order: () => b,
        limit: () => b,
        lt: (_c: string, v: string) => {
          q.lt = v;
          return b;
        },
        then: (res: (v: { data: Pin[]; error: null }) => unknown) => {
          queries.push(q);
          return Promise.resolve({ data: pages.shift() ?? [], error: null }).then(res);
        },
      };
      return b;
    },
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
// The hold-to-peek wrapper is its own tested component; here it only has to
// render its children.
vi.mock("@/components/feed/GridPeek", () => ({
  GridPeek: ({ children, className }: { children: unknown; className?: string }) =>
    createElement("div", { className, "data-pin": "" }, children as never),
}));

const pin = (i: number, over: Partial<Pin> = {}): Pin => ({
  id: `p${i}`,
  user_id: `u${i}`,
  caption: `caption ${i}`,
  body: null,
  image_url: `https://img/${i}.jpg`,
  image_urls: null,
  aspect_ratio: i % 3 === 0 ? 0.75 : 1.25,
  hype_count: 5,
  comment_count: 2,
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 60_000).toISOString(),
  profiles: { display_name: `Name ${i}`, username: `user${i}`, avatar_hue: 100, avatar_url: null },
  ...over,
});
const range = (from: number, n: number) => Array.from({ length: n }, (_, k) => pin(from + k));

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
  observers = [];
  pages = [];
  queries = [];
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function mount(posts: Pin[], endless?: { cursor: string | null; blockedIds: string[] }) {
  const { PinFeed } = await import("@/components/discover/PinFeed");
  root = createRoot(host);
  await act(async () =>
    root!.render(createElement(PinFeed, { posts, currentUserId: "me", endless }))
  );
}
const columns = () => [...host.querySelectorAll(".flex.items-start > div")];
const ids = () => columns().map((c) => [...c.querySelectorAll("a[href^='/p/']")].map((a) => a.getAttribute("href")));

describe("PinFeed layout", () => {
  it("is two columns of pictures and nothing else — no caption, name or counters", async () => {
    await mount(range(0, 6));
    expect(columns()).toHaveLength(2);
    const first = host.querySelector("[data-pin]")!;
    expect(first.textContent).toBe("");
    expect(first.querySelector("img")).not.toBeNull();
    expect(first.querySelector("a[href^='/u/']")).toBeNull();
  });

  it("keeps the caption as the picture's alt text", async () => {
    await mount([pin(0)]);
    expect(host.querySelector("img")!.getAttribute("alt")).toBe("caption 0");
  });

  it("renders a picture-less post as a card of its words", async () => {
    await mount([pin(0, { image_url: null, caption: "just words" })]);
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("just words");
  });
});

describe("PinFeed endless", () => {
  it("shows the pool a step at a time, without asking the database", async () => {
    await mount(range(0, 60), { cursor: "2026-08-01T00:00:00.000Z", blockedIds: [] });
    expect(host.querySelectorAll("[data-pin]")).toHaveLength(24);
    await nearBottom();
    expect(host.querySelectorAll("[data-pin]")).toHaveLength(48);
    expect(queries).toHaveLength(0);
  });

  it("then fetches older posts by itself, from where the pool ended", async () => {
    const cursor = "2026-08-01T00:00:00.000Z";
    pages = [range(100, 24)];
    await mount(range(0, 10), { cursor, blockedIds: [] });
    await nearBottom();
    expect(queries).toHaveLength(1);
    // Older than BOTH the server's cursor and anything on screen.
    expect(queries[0].lt).toBe(cursor);
    expect(host.querySelectorAll("[data-pin]")).toHaveLength(34);
  });

  it("never moves a pin already on screen when a page arrives", async () => {
    pages = [range(100, 24)];
    await mount(range(0, 10), { cursor: null, blockedIds: [] });
    const before = ids();
    await nearBottom();
    const after = ids();
    for (let c = 0; c < 2; c++) {
      expect(after[c].slice(0, before[c].length)).toEqual(before[c]);
    }
  });

  it("drops blocked authors and repeats from a fetched page", async () => {
    pages = [[pin(0), pin(200, { user_id: "blocked" }), ...range(300, 22)]];
    await mount(range(0, 3), { cursor: null, blockedIds: ["blocked"] });
    await nearBottom();
    const hrefs = ids().flat();
    expect(hrefs.filter((h) => h === "/p/p0")).toHaveLength(1);
    expect(hrefs).not.toContain("/p/p200");
  });

  it("does not ask for the same page again when a whole page was dropped", async () => {
    // Every row blocked: nothing is kept, but the cursor must still move past
    // them, or the next request is the same request, forever.
    const dropped = range(400, 24).map((p) => ({ ...p, user_id: "blocked" }));
    pages = [dropped, range(500, 5)];
    await mount(range(0, 2), { cursor: null, blockedIds: ["blocked"] });
    await nearBottom();
    await nearBottom();
    expect(queries).toHaveLength(2);
    expect(queries[1].lt).toBe(dropped[dropped.length - 1].created_at);
  });

  it("stops when the database runs out, and says so", async () => {
    pages = [range(100, 3)];
    await mount(range(0, 2), { cursor: null, blockedIds: [] });
    await nearBottom();
    expect(host.textContent).toContain("seen everything");
    const before = queries.length;
    await nearBottom();
    expect(queries.length).toBe(before);
  });

  it("never shows a Show more button", async () => {
    await mount(range(0, 60), { cursor: null, blockedIds: [] });
    expect(host.textContent).not.toMatch(/show more/i);
  });
});
