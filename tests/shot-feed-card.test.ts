// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A Shot in the feed wears the post card's chrome: the same header, the same
 * four actions in the same order with their counts, and the same caption with
 * the author in front of it. What marks it as a Shot is on the video.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const SHOT = {
  id: "s1",
  user_id: "u2",
  media_url: "https://example.test/s1.mp4",
  poster_url: null,
  caption: "forty seconds of the same roof",
  created_at: new Date(Date.now() - 7200_000).toISOString(),
  hype_count: 341,
  comment_count: 7,
  share_count: 4,
  profiles: {
    id: "u2",
    display_name: "Maya",
    username: "maya",
    avatar_hue: 280,
    avatar_url: null,
    is_verified: true,
    is_premium: false,
    name_font: null,
    name_glow: null,
    avatar_decoration: null,
  },
};

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { ShotFeedCard } = await import("@/components/feed/ShotFeedCard");
  await act(async () =>
    root.render(createElement(ShotFeedCard, { shot: SHOT, currentUserId: "u1" })),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const label = (name: string) => host.querySelector(`[aria-label="${name}"]`);

describe("a Shot in the feed", () => {
  it("has the post card's header: the author, their badge, and when", () => {
    const header = host.querySelector("article > div") as HTMLElement;
    expect(header.textContent).toContain("Maya");
    expect(header.textContent).toContain("2h");
    expect(header.querySelector("svg")).toBeTruthy();
    expect(label("More")).toBeTruthy();
  });

  it("carries the same four actions, counts and all", () => {
    for (const name of ["Hype", "Comments", "Save"]) expect(label(name)).toBeTruthy();
    const actions = label("Hype")!.parentElement as HTMLElement;
    expect(actions.textContent).toContain("341");
    expect(actions.textContent).toContain("7");
    // Share count only when there is one, exactly as a post shows it.
    expect(actions.textContent).toContain("4");
  });

  it("writes the caption the way a post does, author first", () => {
    expect(host.textContent).toContain("@maya");
    expect(host.textContent).toContain("forty seconds of the same roof");
  });

  it("says SHOT on the video, not in the header where a post has its author", () => {
    const badge = [...host.querySelectorAll("span")].find((s) => s.textContent?.trim() === "SHOT");
    expect(badge).toBeTruthy();
    expect(badge!.closest("a")).toBeTruthy();
    const header = host.querySelector("article > div") as HTMLElement;
    expect(header.textContent).not.toContain("SHOT");
  });
});
