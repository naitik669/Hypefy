// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

/**
 * Pulling Discover down must turn the feed over.
 *
 * Naitik, 26 Nov 2026: "on refresh, the discovery feed isn't really getting
 * refreshed". Measured that day: 34 posts in the whole catalogue, the newest
 * 21 days old, so every post sits in the same score tier and the server
 * returns the identical ranking on every request. The Refresh button at the
 * bottom of the feed already handled that by reshuffling inside bands
 * (DiscoverView's refreshCount seed). The pull at the top did not: it was a
 * PullToRefresh wrapped round DiscoverView in the server page, which only
 * called router.refresh(), never touched the seed, and so brought back the
 * same grid in the same order.
 *
 * PullToRefresh is replaced by a stub whose "pull" does exactly what the real
 * one does on release: call onRefresh if given one, else router.refresh().
 * PinFeed is replaced by a stub that prints the order it was handed.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push() {}, back() {}, replace() {} }),
  usePathname: () => "/discover",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("@/components/ui/PullToRefresh", async () => {
  const { useRouter } = await import("next/navigation");
  return {
    PULL_EVENT: "hypefy:pulled",
    PullToRefresh: ({
      children,
      onRefresh,
    }: {
      children: unknown;
      onRefresh?: () => void | Promise<void>;
    }) => {
      const router = useRouter();
      return createElement(
        "div",
        null,
        createElement(
          "button",
          {
            "data-testid": "pull",
            onClick: () => (onRefresh ? void onRefresh() : router.refresh()),
          },
          "pull",
        ),
        children as never,
      );
    },
  };
});
vi.mock("@/components/discover/PinFeed", () => ({
  PinFeed: ({ posts }: { posts: { id: string }[] }) =>
    createElement("ol", { "data-testid": "feed" }, posts.map((p) => createElement("li", { key: p.id }, p.id))),
}));
vi.mock("@/components/ui/SearchBar", () => ({ SearchBar: () => null }));
vi.mock("@/components/discover/DiscoverFilter", () => ({ DiscoverFilter: () => null }));

const post = (i: number) => ({
  id: `p${i}`,
  user_id: `u${i % 7}`,
  caption: null,
  body: null,
  image_url: null,
  image_urls: null,
  aspect_ratio: 1,
  hype_count: 0,
  comment_count: 0,
  created_at: "2026-11-01T00:00:00Z",
  profiles: null,
});

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  refresh.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});

const order = () =>
  [...host.querySelectorAll('[data-testid="feed"] li')].map((li) => li.textContent);

describe("Discover pull-to-refresh", () => {
  it("turns the feed over and still asks the server", async () => {
    const { DiscoverView } = await import("@/components/discover/DiscoverView");
    const rankedPosts = Array.from({ length: 30 }, (_, i) => post(i));
    root = createRoot(host);
    act(() =>
      root!.render(
        createElement(DiscoverView, {
          currentUserId: "me",
          rankedPosts,
          feedCursor: null,
          blockedIds: [],
          trendingPosts: [],
          trendingShots: [],
          feedShots: [],
          people: [],
          tags: [],
        } as never),
      ),
    );

    const before = order();
    expect(before).toEqual(rankedPosts.map((p) => p.id));

    const pull = host.querySelector('[data-testid="pull"]') as HTMLButtonElement | null;
    // Before the fix there was no pull inside DiscoverView at all: it lived
    // in the server page, out of reach of the seed.
    expect(pull).not.toBeNull();
    act(() => pull!.click());

    const after = order();
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("Discover page", () => {
  // Source-read only because a server component with a live Supabase client
  // cannot be run here. Comments and imports are stripped first, so a
  // mention of PullToRefresh in either cannot satisfy or fail this.
  const page = readFileSync("src/app/(app)/discover/page.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import .*$/gm, "");

  it("does not wrap Discover in a second pull that only re-asks the server", () => {
    // Two nested pulls both fire on one gesture: two spinners, two refreshes.
    expect(page).not.toContain("<PullToRefresh");
  });
});
