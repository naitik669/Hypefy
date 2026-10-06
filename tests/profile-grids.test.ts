// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { mergeRehypePage, type RehypeItem } from "@/components/profile/RehypesGrid";
import { appendPage } from "@/components/profile/ProfileGrids";

/**
 * A profile's grids. Your own and everyone else's were two copies that had
 * drifted: theirs stopped at thirty, none could be held, and every Shot was
 * drawn as a video behind a blank cover. One of each now.
 */

const pages = vi.hoisted(() => ({ calls: [] as (string | null)[], rows: (() => []) as (before: string | null) => unknown[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "/u/maya" }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/haptics", () => ({ haptics: { select() {}, tap() {}, success() {} } }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      let before: string | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.lt = (_c: string, v: string) => ((before = v), q);
      q.maybeSingle = async () => ({ data: null });
      q.then = (res: (v: unknown) => void) => {
        pages.calls.push(before);
        res({ data: pages.rows(before), error: null });
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const post = (n: number) => ({
  id: `p${n}`, user_id: "u2", image_url: `https://x.test/${n}.jpg`, image_urls: null, caption: null,
  created_at: new Date(2026, 8, 30 - n).toISOString(), aspect_ratio: 1, hype_count: 0, comment_count: 0,
});

describe("adding a page", () => {
  it("skips anything already shown", () => {
    expect(appendPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("a page of rehypes, out of two lists", () => {
  const p = (id: string, at: string): RehypeItem => ({ kind: "post", id, at, cover: null, caption: null, count: 0, ratio: 1, by: null });
  const s = (id: string, at: string): RehypeItem => ({ kind: "shot", id, at, media: "m", poster: null, caption: null, by: null });

  it("orders by when each was rehyped, posts and Shots together", () => {
    const out = mergeRehypePage([p("p1", "2026-09-05"), p("p2", "2026-09-01")], [s("s1", "2026-09-03")]);
    expect(out.items.map((i) => i.id)).toEqual(["p1", "s1", "p2"]);
    expect(out.more).toBe(false);
  });

  it("shows only a page of the merge, and leaves the rest for next time", () => {
    // Two from each, page of two: the two newest overall, whichever list they are from.
    const out = mergeRehypePage([p("p1", "2026-09-09"), p("p2", "2026-09-02")], [s("s1", "2026-09-08"), s("s2", "2026-09-01")], 2);
    expect(out.items.map((i) => i.id)).toEqual(["p1", "s1"]);
    expect(out.more).toBe(true);
  });

  it("knows there may be more when either list came back full", () => {
    expect(mergeRehypePage([p("p1", "2026-09-09")], [], 1).more).toBe(true);
    expect(mergeRehypePage([p("p1", "2026-09-09")], [], 2).more).toBe(false);
  });
});

describe("the grids on a profile", () => {
  let root: Root;
  let host: HTMLDivElement;
  let seen: (() => void) | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    pages.calls.length = 0;
    seen = null;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        seen = () => cb([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it("loads the next page when the end scrolls into view, for anyone's profile", async () => {
    const full = Array.from({ length: 30 }, (_, i) => post(i));
    pages.rows = (before) => (before ? [post(40), post(41)] : full);
    const { PostsGrid } = await import("@/components/profile/ProfileGrids");
    await act(async () => root.render(createElement(PostsGrid, { userId: "u2", viewerId: "me", empty: "none" })));
    await settle();
    expect(host.querySelectorAll("a")).toHaveLength(30);

    await act(async () => seen?.());
    await settle();
    expect(host.querySelectorAll("a")).toHaveLength(32);
    // Asked for what is older than the last one shown.
    expect(pages.calls.at(-1)).toBe(full[29].created_at);
  });

  it("says so when there is nothing", async () => {
    pages.rows = () => [];
    const { PostsGrid } = await import("@/components/profile/ProfileGrids");
    await act(async () => root.render(createElement(PostsGrid, { userId: "u2", empty: "No posts yet" })));
    await settle();
    expect(host.textContent).toBe("No posts yet");
  });

  it("draws a Shot's own cover, not a video behind a blank one", async () => {
    pages.rows = () => [
      { id: "s1", user_id: "u2", media_url: "https://x.test/s1.mp4", poster_url: "https://x.test/s1.jpg", caption: null, created_at: "2026-09-30T00:00:00.000Z", hype_count: 0, comment_count: 0 },
      { id: "s2", user_id: "u2", media_url: "https://x.test/s2.mp4", poster_url: null, caption: null, created_at: "2026-09-29T00:00:00.000Z", hype_count: 0, comment_count: 0 },
    ];
    const { ShotsGrid } = await import("@/components/profile/ProfileGrids");
    await act(async () => root.render(createElement(ShotsGrid, { userId: "u2", empty: "none" })));
    await settle();
    const [withCover, without] = [...host.querySelectorAll("a")];
    expect(withCover.querySelector("img")!.getAttribute("src")).toBe("https://x.test/s1.jpg");
    expect(withCover.querySelector("video")).toBeNull();
    // No cover: the video, asked for a frame.
    expect(without.querySelector("video")!.getAttribute("src")).toBe("https://x.test/s2.mp4#t=0.1");
  });

  it("lifts a tile out when it is held", async () => {
    vi.useFakeTimers();
    pages.rows = (before) => (before ? [] : [post(1)]);
    const { PostsGrid } = await import("@/components/profile/ProfileGrids");
    await act(async () => root.render(createElement(PostsGrid, { userId: "u2", viewerId: "me", empty: "none" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const tile = host.querySelector("a")!.parentElement as HTMLElement;
    await act(async () => {
      tile.dispatchEvent(Object.assign(new MouseEvent("pointerdown", { bubbles: true, button: 0 }), { pointerId: 1, pointerType: "touch" }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(document.querySelector('[role="dialog"][aria-label="Post preview"]')).toBeTruthy();
    vi.useRealTimers();
  });
});

describe("whose work a rehype is", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    pages.calls.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  it("is named on each tile, post and Shot alike", async () => {
    // Both tables are asked the same way; each takes its own half of the row.
    pages.rows = () => [
      {
        created_at: "2026-09-20T10:00:00Z",
        posts: { id: "p1", image_url: "https://x.test/p1.jpg", image_urls: null, caption: "dusk", aspect_ratio: 1, profiles: { username: "maya" } },
        shots: { id: "s1", media_url: "https://x.test/s1.mp4", poster_url: "https://x.test/s1.jpg", caption: null, profiles: [{ username: "bo.b" }] },
      },
    ];
    const { RehypesGrid } = await import("@/components/profile/RehypesGrid");
    await act(async () => root.render(createElement(RehypesGrid, { userId: "u9", isOwn: false, name: "Riya" })));
    const names = [...host.querySelectorAll("[data-made-by]")].map((n) => n.textContent).sort();
    expect(names).toEqual(["@bo.b", "@maya"]);
  });

  it("leaves the name off rather than guess, when the maker cannot be read", async () => {
    pages.rows = () => [
      {
        created_at: "2026-09-20T10:00:00Z",
        posts: { id: "p1", image_url: "https://x.test/p1.jpg", image_urls: null, caption: null, aspect_ratio: 1, profiles: null },
        shots: null,
      },
    ];
    const { RehypesGrid } = await import("@/components/profile/RehypesGrid");
    await act(async () => root.render(createElement(RehypesGrid, { userId: "u9", isOwn: false })));
    expect(host.querySelectorAll('a[href="/p/p1"]')).toHaveLength(1);
    expect(host.querySelector("[data-made-by]")).toBeNull();
  });
});
