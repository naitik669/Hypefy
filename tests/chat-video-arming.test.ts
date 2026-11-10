// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { ChatVideo } from "@/components/messages/ChatMedia";

/**
 * A chat thread holds a video decoder only for the clips near the screen.
 *
 * Every video message committed its `src` with `preload="metadata"` as soon as
 * it rendered, and the thread renders every message it has loaded — so
 * scrolling back through a chat full of clips accumulated one live decoder per
 * video with no ceiling. Android's WebView gives out somewhere past six to
 * sixteen of them. That is the freeze, in the one place the audit missed; the
 * reels feed had the same bug.
 */

type Entry = { isIntersecting: boolean };
type Watcher = {
  fire: (isIntersecting: boolean) => void;
  rootMargin: string | undefined;
  disconnected: boolean;
  target: Element | null;
};

let watchers: Watcher[] = [];

class FakeObserver {
  private readonly watcher: Watcher;
  constructor(cb: (entries: Entry[]) => void, opts?: { rootMargin?: string }) {
    this.watcher = {
      fire: (isIntersecting) => cb([{ isIntersecting }]),
      rootMargin: opts?.rootMargin,
      disconnected: false,
      target: null,
    };
    watchers.push(this.watcher);
  }
  observe(el: Element) {
    this.watcher.target = el;
  }
  unobserve() {}
  disconnect() {
    this.watcher.disconnected = true;
  }
}

// Not a chat-media URL, so useChatMediaUrl hands it straight back and nothing
// has to be signed — the arming is what is under test, not the signing.
const URL = "https://x.test/clip.mp4";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  watchers = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

async function mount(props: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(createElement(ChatVideo, { url: URL, className: "w-full", ...props } as never));
  });
  const el = host.querySelector("video");
  if (!el) throw new Error("no <video> rendered");
  // jsdom's load() is a not-implemented stub; a spy both silences it and lets
  // us assert that releasing actually asks the element to drop its resource.
  const load = vi.fn();
  Object.defineProperty(el, "load", { value: load, configurable: true });
  return { el, load };
}

const only = () => {
  expect(watchers).toHaveLength(1);
  return watchers[0];
};

/** jsdom gives `paused` and `currentTime` read-only defaults. */
const pretend = (el: HTMLVideoElement, state: { paused: boolean; currentTime: number }) => {
  Object.defineProperty(el, "paused", { value: state.paused, configurable: true });
  Object.defineProperty(el, "currentTime", { value: state.currentTime, configurable: true });
};

describe("before it comes near the screen", () => {
  it("has no source and is told to preload nothing", async () => {
    const { el } = await mount();
    expect(el.hasAttribute("src")).toBe(false);
    expect(el.getAttribute("preload")).toBe("none");
  });

  it("still draws a poster, so the bubble keeps its shape", async () => {
    const { el } = await mount();
    expect(el.getAttribute("poster")).toBeTruthy();
  });

  it("is watched with a margin, so it loads before it is actually visible", async () => {
    await mount();
    expect(only().rootMargin).toBe("200px");
  });
});

describe("once it is near", () => {
  it("takes its source and preloads", async () => {
    const { el } = await mount();
    await act(async () => only().fire(true));
    expect(el.getAttribute("src")).toBe(URL);
    expect(el.getAttribute("preload")).toBe("metadata");
  });

  it("honours a preload the caller asked for", async () => {
    const { el } = await mount({ preload: "auto" });
    await act(async () => only().fire(true));
    expect(el.getAttribute("preload")).toBe("auto");
  });

  it("appends the fragment the caller passed", async () => {
    const { el } = await mount({ fragment: "#t=0.1" });
    await act(async () => only().fire(true));
    expect(el.getAttribute("src")).toBe(`${URL}#t=0.1`);
  });
});

describe("when it leaves again", () => {
  it("an untouched clip gives up its source, and is told to drop it", async () => {
    const { el, load } = await mount();
    await act(async () => only().fire(true));
    pretend(el, { paused: true, currentTime: 0 });

    await act(async () => only().fire(false));
    expect(el.hasAttribute("src")).toBe(false);
    expect(el.getAttribute("preload")).toBe("none");
    // Removing the attribute alone would leave the decoder alive: resource
    // selection re-runs on a set, never on a removal.
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("but one that is playing keeps it", async () => {
    const { el, load } = await mount();
    await act(async () => only().fire(true));
    pretend(el, { paused: false, currentTime: 4 });

    await act(async () => only().fire(false));
    expect(el.getAttribute("src")).toBe(URL);
    expect(load).not.toHaveBeenCalled();
  });

  it("and one paused part-way keeps it too, so it does not rewind", async () => {
    const { el, load } = await mount();
    await act(async () => only().fire(true));
    pretend(el, { paused: true, currentTime: 12.5 });

    await act(async () => only().fire(false));
    expect(el.getAttribute("src")).toBe(URL);
    expect(load).not.toHaveBeenCalled();
  });

  it("and it can be armed a second time when it comes back", async () => {
    const { el } = await mount();
    await act(async () => only().fire(true));
    pretend(el, { paused: true, currentTime: 0 });
    await act(async () => only().fire(false));
    expect(el.hasAttribute("src")).toBe(false);

    await act(async () => only().fire(true));
    expect(el.getAttribute("src")).toBe(URL);
  });

  it("nothing is dropped if it was never armed in the first place", async () => {
    const { el, load } = await mount();
    pretend(el, { paused: true, currentTime: 0 });
    await act(async () => only().fire(false));
    expect(load).not.toHaveBeenCalled();
  });
});

describe("where there is no observer", () => {
  it("every clip is armed, rather than a thread of blank tiles", async () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    const { el } = await mount();
    expect(el.getAttribute("src")).toBe(URL);
    expect(el.getAttribute("preload")).toBe("metadata");
    expect(watchers).toHaveLength(0);
  });
});

describe("tidying up", () => {
  it("the observer is disconnected when the message goes", async () => {
    await mount();
    const w = only();
    await act(async () => root.unmount());
    root = createRoot(host);
    expect(w.disconnected).toBe(true);
  });

  it("one observer per video, not one per render", async () => {
    await mount();
    await act(async () => only().fire(true));
    expect(watchers).toHaveLength(1);
  });
});

describe("the thread's own video message", () => {
  const chat = readFileSync("src/components/messages/RealChatView.tsx", "utf8").replace(/\r\n/g, "\n");

  it("goes through ChatVideo, so it gets the gating", () => {
    expect(chat).toContain("<ChatVideo url={m._localUrl ?? m.body}");
  });

  it("and the only raw <video> left is the composer's own attachment", () => {
    // A raw <video> anywhere in the message list would be exactly the bug
    // this fixes, so the count is what matters, not where it sits. The one
    // that remains is the preview of a file you are about to send: a local
    // blob, on screen, one at a time.
    const raw = chat.match(/<video\b/g) ?? [];
    expect(raw).toHaveLength(1);
    expect(chat).toContain("<video poster={BLANK_POSTER} src={attachment.preview}");
  });
});
