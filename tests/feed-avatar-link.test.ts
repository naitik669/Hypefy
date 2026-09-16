// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Tapping someone's face in the feed goes to them: their Show while one is
 * live, their profile otherwise. It used to open their avatar full-screen —
 * a photo of a person where you expected the person.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  usePathname: () => "/home",
}));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
/**
 * A query that answers "nothing", however it is chained.
 *
 * These cards each ask the database a few things on mount — the viewer's own
 * hype, whether it is saved — and a mock shaped like one call is a pile of
 * unhandled rejections from the others.
 */
vi.mock("@/lib/supabase/client", () => {
  const nothing = () => {
    const answer = Promise.resolve({ data: null, error: null });
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, key: string) {
          // Bound: an unbound Promise.prototype.then called on this proxy
          // throws "incompatible receiver".
          if (key === "then") return answer.then.bind(answer);
          if (key === "catch") return answer.catch.bind(answer);
          if (key === "finally") return answer.finally.bind(answer);
          return () => proxy;
        },
      },
    );
    return proxy as { then: unknown };
  };
  return { createClient: () => ({ from: nothing, rpc: nothing }) };
});

const AUTHOR = {
  id: "u2",
  display_name: "Maya",
  username: "maya",
  avatar_hue: 280,
  avatar_url: "https://example.test/maya.jpg",
  is_verified: false,
};

const SHOT = {
  id: "s1",
  user_id: "u2",
  media_url: "https://example.test/s1.mp4",
  poster_url: null,
  caption: "hey",
  created_at: new Date().toISOString(),
  hype_count: 1,
  comment_count: 0,
  profiles: AUTHOR,
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function shot(showId?: string) {
  const { ShotFeedCard } = await import("@/components/feed/ShotFeedCard");
  await act(async () =>
    root.render(createElement(ShotFeedCard, { shot: SHOT, currentUserId: "u1", showId })),
  );
  // The first link in the header is the author's face.
  return host.querySelector("a") as HTMLAnchorElement;
}

describe("the author's face on a card", () => {
  it("goes to their profile", async () => {
    const link = await shot();
    expect(link.getAttribute("href")).toBe("/u/maya");
    expect(link.getAttribute("aria-label")).toContain("profile");
  });

  it("goes to their Show while they have one", async () => {
    const link = await shot("show-7");
    expect(link.getAttribute("href")).toBe("/shows/show-7");
    expect(link.getAttribute("aria-label")).toContain("Show");
  });
});

const POST = {
  id: "p1",
  user_id: "u2",
  caption: "the roof",
  body: null,
  image_url: "https://example.test/p1.jpg",
  hashtags: [],
  mentions: [],
  hype_count: 3,
  comment_count: 1,
  created_at: new Date().toISOString(),
  profiles: { ...AUTHOR, profile_tags: [] },
};

describe("the author's face on a post", () => {
  async function card(showId?: string) {
    const { FeedCard } = await import("@/components/feed/FeedCard");
    await act(async () =>
      root.render(createElement(FeedCard, { post: POST, currentUserId: "u1", showId })),
    );
    return host.querySelector("a") as HTMLAnchorElement;
  }

  it("goes to their profile", async () => {
    const link = await card();
    expect(link.getAttribute("href")).toBe("/u/maya");
  });

  it("goes to their Show while they have one", async () => {
    const link = await card("show-7");
    expect(link.getAttribute("href")).toBe("/shows/show-7");
  });
});
