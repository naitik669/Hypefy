// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Holding a tile in a grid.
 *
 * It worked for a post and did nothing at all for a Shot — the one tile in
 * Discover where you most want to know what you are looking at, because a
 * still of a video tells you least. And the post peek it did open was the
 * only peek in the app with no rehype on it.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  usePathname: () => "/discover",
}));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/haptics", () => ({ haptics: { select() {}, tap() {}, success() {} } }));
vi.mock("@/lib/rehype", () => ({
  isRehyped: async () => false,
  setRehype: async () => ({ ok: true, rehyped: true }),
}));

/** Every query answers "no row", which is all a peek needs to open. */
const chain: Record<string, unknown> = {};
chain.select = () => chain;
chain.eq = () => chain;
chain.insert = async () => ({ error: null });
chain.delete = () => chain;
chain.maybeSingle = async () => ({ data: null });
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => chain, rpc: async () => ({ data: null, error: null }) }),
}));

const pointerDown = () =>
  Object.assign(new MouseEvent("pointerdown", { bubbles: true, clientX: 8, clientY: 8, button: 0 }), {
    pointerId: 1,
    pointerType: "touch",
  });

const AUTHOR = {
  id: "u2",
  name: "Maya",
  username: "maya",
  avatarUrl: null,
  hue: 280,
  verified: false,
};

let root: Root;
let host: HTMLDivElement;

async function mount(post: Record<string, unknown>, kind: "post" | "shot") {
  const mod = await import("@/components/feed/GridPeek");
  // The tile goes in as a child argument, which is what the lint rule wants;
  // the cast is so the children prop does not also have to be named here.
  const GridPeek = mod.GridPeek as unknown as FunctionComponent<
    Record<string, unknown>
  >;
  await act(async () =>
    root.render(
      createElement(
        GridPeek,
        { post, kind, currentUserId: "u1" },
        createElement("div", { "data-tile": true }, "tile"),
      ),
    ),
  );
}

/** Press and wait past the hold threshold without moving. */
async function hold() {
  const tile = host.querySelector("[data-tile]")!.parentElement as HTMLElement;
  await act(async () => void tile.dispatchEvent(pointerDown()));
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  // Let the state queries that follow the open settle.
  await act(async () => {
    await Promise.resolve();
  });
}

const peek = () => document.querySelector('[role="dialog"][aria-label="Post preview"]');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const SHOT = {
  id: "s1",
  user_id: "u2",
  caption: "forty seconds of the same roof",
  image: null,
  video: "https://example.test/s1.mp4",
  aspect_ratio: 9 / 16,
  hype_count: 12,
  comment_count: 3,
  author: AUTHOR,
};

const POST = {
  id: "p1",
  user_id: "u2",
  caption: "a roof",
  image: "https://example.test/p1.jpg",
  aspect_ratio: 1,
  hype_count: 12,
  comment_count: 3,
  author: AUTHOR,
};

describe("holding a Shot tile", () => {
  it("opens it and plays the video, not a frame of it", async () => {
    await mount(SHOT, "shot");
    await hold();
    const video = peek()?.querySelector("video") as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute("src")).toBe(SHOT.video);
    expect(video.hasAttribute("autoplay")).toBe(true);
  });

  it("opens even with no poster, which is the Shot you most want to hold", async () => {
    // A posterless Shot is a black tile: holding it is the only way to find
    // out what it is, so the hold must not be gated on having a still.
    await mount({ ...SHOT, image: null }, "shot");
    await hold();
    expect(peek()).toBeTruthy();
  });

  it("carries the rehype, and none of the floating faces", async () => {
    await mount(SHOT, "shot");
    await hold();
    expect(peek()!.querySelector('[aria-label="Rehype"]')).toBeTruthy();
    expect(peek()!.querySelector(".rehype-deck")).toBeFalsy();
  });
});

describe("holding a post tile", () => {
  it("still shows the still, and now the rehype too", async () => {
    await mount(POST, "post");
    await hold();
    expect(peek()).toBeTruthy();
    expect(peek()!.querySelector("video")).toBeFalsy();
    expect(peek()!.querySelector('[aria-label="Rehype"]')).toBeTruthy();
  });

  it("does nothing for a post with no picture to lift", async () => {
    await mount({ ...POST, image: null }, "post");
    await hold();
    expect(peek()).toBeFalsy();
  });
});
