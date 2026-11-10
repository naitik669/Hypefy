// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync } from "node:fs";

/**
 * A feed asks who rehyped a post when you reach it, not when it mounts.
 *
 * `useRehypeDeck` has always taken an `enabled` flag for this — its own
 * comment says "enabled lets a feed load only what is on or near the screen"
 * — and FeedCard was the single caller that never passed it. So a feed page
 * mounted twenty cards and all twenty asked at once, before anyone had
 * scrolled to any of them.
 *
 * rehype_deck was called 29,475 times at a mean of 112ms, max 7.9s, standard
 * deviation 507ms, with no disk reads — against a minimum of 1.3ms, and a
 * second parameter shape with no burst behind it that ran at 1.5ms. The query
 * was never slow. Twenty copies of it arriving together were.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

let rpc: ReturnType<typeof vi.fn>;
let profileSelect: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => profileSelect(),
        }),
      }),
    }),
  }),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rpc = vi.fn(async () => ({ data: [], error: null }));
  profileSelect = vi.fn(async () => ({ data: null, error: null }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.resetModules();
});

async function render(props: { enabled: boolean; userId?: string | null; target?: string }) {
  const { useRehypeDeck } = await import("@/lib/use-rehype-deck");
  function Probe({ enabled, userId, target }: { enabled: boolean; userId: string | null; target: string }) {
    useRehypeDeck("post", target, userId, false, enabled);
    return null;
  }
  await act(async () => {
    root.render(
      createElement(Probe, {
        enabled: props.enabled,
        userId: props.userId === undefined ? "me" : props.userId,
        target: props.target ?? `p-${Math.random()}`,
      }),
    );
  });
  return Probe;
}

const deckCalls = () => rpc.mock.calls.filter((c) => c[0] === "rehype_deck").length;

describe("the deck waits until the card is near", () => {
  it("asks nothing while it is disabled", async () => {
    await render({ enabled: false });
    expect(deckCalls()).toBe(0);
  });

  it("and asks once it is enabled", async () => {
    await render({ enabled: true });
    expect(deckCalls()).toBe(1);
  });

  it("asks when the flag flips, not before", async () => {
    const target = "p-flip";
    const Probe = await render({ enabled: false, target });
    expect(deckCalls()).toBe(0);

    await act(async () => {
      root.render(createElement(Probe, { enabled: true, userId: "me", target }));
    });
    expect(deckCalls()).toBe(1);
  });

  it("and never without somebody to rank it for", async () => {
    await render({ enabled: true, userId: null });
    expect(deckCalls()).toBe(0);
  });
});

describe("every caller passes a gate", () => {
  /**
   * This is the actual regression. Omitting the argument is silent — it
   * defaults to true — so nothing fails and the feed quietly asks about
   * every card it has mounted.
   */
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });

  const callSites = walk("src")
    .filter((f) => !f.endsWith("use-rehype-deck.ts"))
    .flatMap((f) => [...read(f).matchAll(/useRehypeDeck\(([^)]*)\)/g)].map((m) => [f, m[1]] as const));

  it("there are three of them, and the default is never relied on", () => {
    expect(callSites.length).toBe(3);
    for (const [file, args] of callSites) {
      const count = args.split(",").length;
      expect(count, `${file} passes ${count} arguments to useRehypeDeck`).toBe(5);
    }
  });

  it("and none of them hard-codes it on", () => {
    for (const [file, args] of callSites) {
      const last = args.split(",").pop()!.trim();
      expect(last, file).not.toBe("true");
    }
  });
});

describe("how the post card decides", () => {
  const card = read("src/components/feed/FeedCard.tsx");

  it("it watches the card itself, with a margin", () => {
    expect(card).toContain('const DECK_MARGIN = "200px";');
    expect(card).toContain("{ rootMargin: DECK_MARGIN }");
    expect(card).toContain("io.observe(el)");
  });

  it("arms once and then stops watching", () => {
    const effect = card.slice(card.indexOf("if (deckNear) return;"));
    expect(effect.slice(0, effect.indexOf("}, [deckNear]);"))).toContain("return () => io.disconnect();");
  });

  it("a browser with no observer still shows its faces", () => {
    // Unlike the Shot card, where losing the observer costs only autoplay,
    // here it would mean a feed that never names anyone.
    expect(card).toContain(
      '() => typeof window !== "undefined" && typeof IntersectionObserver === "undefined",',
    );
  });

  it("and the server does not fetch during SSR", () => {
    // The `window` half is what keeps the server's answer false.
    const init = card.slice(card.indexOf("const [deckNear, setDeckNear] = useState("));
    expect(init.slice(0, init.indexOf(");"))).toContain('typeof window !== "undefined"');
  });
});
