// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LEGACY_RECENT_KEY, latestOnly, recentSearchKey } from "@/lib/search-run";

/**
 * Search, getting the answer right: a slow reply to an old question must not
 * replace the reply to the newest one; a failed search is not "nothing
 * found"; Shots are found too; and one account's recent searches are not
 * shown to another.
 */

type Reply = { data: unknown; error: unknown };
const server = vi.hoisted(() => ({
  /** Each rpc call parks here until the test lets it answer. */
  waiting: [] as { fn: string; q: string; answer: (r: Reply) => void }[],
  user: "me",
}));

function parked(fn: string, q: string) {
  let answer!: (r: Reply) => void;
  const promise = new Promise<Reply>((res) => { answer = res; });
  server.waiting.push({ fn, q, answer });
  // Thenable, and (for posts) chainable through .select().
  const thenable = { then: (ok: (r: Reply) => unknown, bad?: (e: unknown) => unknown) => promise.then(ok, bad), select: () => thenable };
  return thenable;
}

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, back() {}, refresh() {} }) }));
vi.mock("@/lib/safe-back", () => ({ safeBack: () => {} }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/components/search/SearchDiscovery", () => ({
  SearchDiscovery: (p: { recent: string[] }) => createElement("div", { "data-recent": p.recent.join("|") }),
}));
vi.mock("@/components/search/PostResultsGrid", () => ({
  PostResultsGrid: (p: { posts: { id: string }[] }) => createElement("div", { "data-posts": p.posts.map((x) => x.id).join(",") }),
}));
vi.mock("@/components/ui/SearchBar", () => ({
  SearchBar: (p: { value: string; onChange: (v: string) => void; onSubmit: () => void }) =>
    createElement("input", {
      "data-search": true,
      value: p.value,
      onChange: (e: { target: { value: string } }) => p.onChange(e.target.value),
      onKeyDown: (e: { key: string }) => e.key === "Enter" && p.onSubmit(),
    }),
}));
vi.mock("@/lib/supabase/client", () => {
  const rows = { then: (ok: (r: Reply) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) };
  const table = { select: () => table, eq: () => rows };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: server.user ? { id: server.user } : null } }) },
      from: () => table,
      rpc: (fn: string, args: { p_q?: string }) => parked(fn, args.p_q ?? ""),
    }),
  };
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  server.waiting.length = 0;
  server.user = "me";
  localStorage.clear();
  window.history.replaceState(null, "", "/search");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  // Nothing is left hanging: React holds every root in "pending" until the
  // last transition anywhere has settled.
  await act(async () => {
    for (const w of server.waiting) w.answer({ data: [], error: null });
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function open() {
  const { default: SearchPage } = await import("@/app/(app)/search/page");
  await act(async () => root.render(createElement(SearchPage)));
}
async function type(text: string) {
  const input = host.querySelector("[data-search]") as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // Past the debounce, so the search actually goes out.
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
}
/** Let every parked request for this query answer. */
async function reply(q: string, by: Partial<Record<string, Reply>>) {
  const mine = server.waiting.filter((w) => w.q === q);
  await act(async () => {
    for (const w of mine) w.answer(by[w.fn] ?? { data: [], error: null });
    await vi.advanceTimersByTimeAsync(0);
  });
  server.waiting = server.waiting.filter((w) => w.q !== q);
}
const post = (id: string) => ({ id, user_id: "u9", caption: id, hashtags: [], profiles: null });
const shot = (id: string) => ({ id, user_id: "u9", media_url: `https://x.test/${id}.mp4`, poster_url: `https://x.test/${id}.jpg`, caption: id });

describe("only the newest request speaks", () => {
  it("lets the latest through and turns the earlier ones away", () => {
    const runs = latestOnly();
    const a = runs.begin();
    const b = runs.begin();
    expect(runs.isCurrent(a)).toBe(false);
    expect(runs.isCurrent(b)).toBe(true);
    runs.cancel();
    expect(runs.isCurrent(b)).toBe(false);
  });
});

describe("the search page", () => {
  it("keeps the results for what is in the box when an older answer arrives late", async () => {
    await open();
    await type("ab");
    await type("abc");
    // The newer question is answered first…
    await reply("abc", { search_posts: { data: [post("for-abc")], error: null } });
    // …and then the older one finally comes back.
    await reply("ab", { search_posts: { data: [post("for-ab")], error: null } });
    expect(host.querySelector("[data-posts]")?.getAttribute("data-posts")).toBe("for-abc");
  });

  it("drops an answer that arrives after the box was emptied", async () => {
    await open();
    await type("ab");
    await type("");
    await reply("ab", { search_posts: { data: [post("for-ab")], error: null } });
    expect(host.querySelector("[data-posts]")).toBeNull();
    expect(host.querySelector("[data-recent]")).not.toBeNull();
  });

  it("says the search failed, instead of that nothing matched", async () => {
    await open();
    await type("dusk");
    const down = { data: null, error: new Error("offline") };
    await reply("dusk", { search_people: down, search_posts: down, search_shots: down });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Search didn’t go through");
    expect(host.textContent).not.toContain("Nothing's biting");

    // Try again asks again, and a good answer clears the complaint.
    await act(async () => {
      ([...host.querySelectorAll("button")].find((b) => b.textContent === "Try again") as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    await reply("dusk", { search_posts: { data: [post("p1")], error: null } });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector("[data-posts]")?.getAttribute("data-posts")).toBe("p1");
  });

  it("still says nothing matched when the search worked and found nothing", async () => {
    await open();
    await type("zzz");
    await reply("zzz", {});
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("Nothing's biting");
  });

  it("shows what did come back when only one part failed", async () => {
    await open();
    await type("dusk");
    await reply("dusk", {
      search_people: { data: null, error: new Error("no") },
      search_posts: { data: [post("p1")], error: null },
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector("[data-posts]")?.getAttribute("data-posts")).toBe("p1");
  });

  it("finds Shots, under their own heading and their own tab", async () => {
    await open();
    await type("dusk");
    expect(server.waiting.map((w) => w.fn)).toContain("search_shots");
    await reply("dusk", { search_shots: { data: [shot("s1"), shot("s2")], error: null } });
    const links = [...host.querySelectorAll("[data-shot-results] a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/shots/s1", "/shots/s2"]);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain("Shots");
  });

  it("does not look for Shots when the search is for a person", async () => {
    await open();
    await type("@maya");
    expect(server.waiting.map((w) => w.fn)).toEqual(["search_people"]);
  });
});

describe("recent searches", () => {
  it("belong to the account, not the phone", async () => {
    localStorage.setItem(LEGACY_RECENT_KEY, JSON.stringify(["whoever was here"]));
    localStorage.setItem(recentSearchKey("someone-else"), JSON.stringify(["theirs"]));
    localStorage.setItem(recentSearchKey("me"), JSON.stringify(["mine"]));
    await open();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(host.querySelector("[data-recent]")?.getAttribute("data-recent")).toBe("mine");
    expect(localStorage.getItem(LEGACY_RECENT_KEY)).toBeNull();
    expect(localStorage.getItem(recentSearchKey("someone-else"))).toContain("theirs");
  });

  it("are saved under the account that searched", async () => {
    await open();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await type("golden hour");
    await act(async () => {
      host.querySelector("[data-search]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(localStorage.getItem(recentSearchKey("me"))).toContain("golden hour");
    expect(localStorage.getItem(LEGACY_RECENT_KEY)).toBeNull();
  });
});
