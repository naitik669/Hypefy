// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Send to: faces four across, what you are sending named at the top, and a
 * bottom that is either everything else you can do or sending — never both.
 */

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/lib/useFocusTrap", () => ({ useFocusTrap: () => ({ current: null }) }));

const PEOPLE = ["Maya", "Leo", "Ada"].map((name, i) => ({
  id: `u${i + 2}`,
  display_name: name,
  username: name.toLowerCase(),
  avatar_hue: 100 + i,
  avatar_url: null,
}));

/** Answers a query by the table it was asked of, however it is chained. */
vi.mock("@/lib/supabase/client", () => {
  const answerFor = (table: string) => {
    switch (table) {
      case "follows":
        return PEOPLE.map((p) => ({ following_id: p.id, follower_id: p.id }));
      case "profiles":
        return PEOPLE;
      case "posts":
        return { caption: "the roof at golden hour", body: null, image_url: null, image_urls: [], profiles: { username: "maya" } };
      default:
        return [];
    }
  };
  const query = (table: string) => {
    const answer = Promise.resolve({ data: answerFor(table), error: null });
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, key: string) {
          if (key === "then") return answer.then.bind(answer);
          if (key === "catch") return answer.catch.bind(answer);
          if (key === "finally") return answer.finally.bind(answer);
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => query(table),
    rpc,
  };
  return { createClient: () => client };
});

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) =>
    fn === "get_or_create_dm" ? { data: "c1", error: null } : { data: null, error: null },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { ShareSheet } = await import("@/components/feed/ShareSheet");
  await act(async () =>
    root.render(createElement(ShareSheet, { open: true, onClose: () => {}, postId: "p1" })),
  );
  // Let the two loads land.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const face = (name: string) =>
  [...document.querySelectorAll("[data-sheet] button[aria-pressed]")].find((b) =>
    b.textContent?.includes(name),
  ) as HTMLButtonElement;
const footer = () => document.querySelector("[data-sheet-footer]") as HTMLElement;
const tap = (el: HTMLElement) => act(async () => void el.click());

describe("Send to", () => {
  it("names what is being sent, and shows the people as faces", () => {
    const sheet = document.querySelector("[data-sheet]")!;
    expect(sheet.textContent).toContain("the roof at golden hour");
    expect(sheet.textContent).toContain("@maya");
    expect(face("Maya")).toBeTruthy();
    expect(face("Ada")).toBeTruthy();
  });

  it("offers everything else until someone is picked", () => {
    const text = footer().textContent ?? "";
    for (const label of ["Copy link", "Repost", "Add to Show", "WhatsApp", "More"]) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain("Send to");
  });

  it("turns the bottom into sending as soon as anyone is picked, for as many as you like", async () => {
    await tap(face("Maya"));
    await tap(face("Ada"));
    expect(face("Maya").getAttribute("aria-pressed")).toBe("true");
    const text = footer().textContent ?? "";
    expect(text).toContain("Send to 2");
    expect(text).toContain("Maya, Ada");
    // The options step aside rather than sharing the space.
    expect(text).not.toContain("Copy link");
  });

  it("sends the post to each, then the message after it", async () => {
    await tap(face("Maya"));
    await tap(face("Leo"));
    const input = footer().querySelector("input") as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "you have to see this");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = [...footer().querySelectorAll("button")].find((b) => b.textContent?.includes("Send to"))!;
    await tap(send);

    const sends = rpc.mock.calls.filter(([fn]) => fn === "send_message").map(([, args]) => args);
    const posts = sends.filter((a) => a.p_kind === "post");
    const notes = sends.filter((a) => a.p_kind === "text");
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ p_post_id: "p1" });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ p_body: "you have to see this" });
  });

  it("sends no message when none was written", async () => {
    await tap(face("Maya"));
    const send = [...footer().querySelectorAll("button")].find((b) => b.textContent?.includes("Send to"))!;
    await tap(send);
    const kinds = rpc.mock.calls.filter(([fn]) => fn === "send_message").map(([, a]) => a.p_kind);
    expect(kinds).toEqual(["post"]);
  });
});
