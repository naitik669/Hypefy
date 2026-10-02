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
// One face in the deck, so "the card has one and the peek does not" is a claim
// about something that exists rather than a selector that never matches.
vi.mock("@/lib/use-rehype-deck", () => ({
  useRehypeDeck: () => [
    { userId: "u3", name: "Ira", username: "ira", avatarUrl: null, hue: 120, isMe: false },
  ],
}));
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

/**
 * A Shot in the home feed can be passed on, and can be lifted out of the feed
 * and watched. Both were things a post card could already do and a Shot card
 * could not — the same content, two different sets of what you can do with it.
 */
/** jsdom has no PointerEvent; a MouseEvent with a pointerId is what React reads. */
const pointerDown = () =>
  Object.assign(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10, button: 0 }), {
    pointerId: 1,
    pointerType: "touch",
  });

describe("rehyping a Shot from the feed", () => {
  it("offers the rehype beside Save, where the post card keeps it", () => {
    const rehype = label("Rehype") as HTMLElement;
    expect(rehype).toBeTruthy();
    // Same row as Save, and not in the reactions group on the left.
    expect(rehype.parentElement).toBe(label("Save")!.parentElement);
    expect(rehype.parentElement).not.toBe(label("Hype")!.parentElement);
  });

  it("says in its label whether it is on, so the icon is not the only word for it", () => {
    expect(label("Rehype")).toBeTruthy();
    expect(label("Rehyped. Tap to undo")).toBeFalsy();
  });
});

describe("holding a Shot in the feed", () => {
  /** A hold: down, wait past the threshold, no movement. */
  async function hold() {
    const media = host.querySelector("a[href='/shots/s1']") as HTMLElement;
    await act(async () => {
      media.dispatchEvent(
        pointerDown(),
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lifts the Shot out and PLAYS it, rather than freezing a frame of it", async () => {
    await hold();
    const peek = document.querySelector('[role="dialog"][aria-label="Shot preview"]');
    expect(peek).toBeTruthy();
    const video = peek!.querySelector("video") as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute("src")).toBe(SHOT.media_url);
    expect(video.hasAttribute("autoplay")).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
  });

  it("carries the rehype into the peek, and none of the faces", async () => {
    await hold();
    const peek = document.querySelector('[role="dialog"][aria-label="Shot preview"]')!;
    expect(peek.querySelector('[aria-label="Rehype"]')).toBeTruthy();
    // The deck belongs on the card, where it can be dragged off. Over a Shot
    // someone opened to watch properly it is just something in the way.
    expect(host.querySelector(".rehype-deck")).toBeTruthy();
    expect(peek.querySelector(".rehype-deck")).toBeFalsy();
  });

  it("does nothing when the hold lands on the mute button", async () => {
    const mute = label("Unmute") as HTMLElement;
    await act(async () => {
      mute.dispatchEvent(
        pointerDown(),
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(document.querySelector('[aria-label="Shot preview"]')).toBeFalsy();
  });
});
