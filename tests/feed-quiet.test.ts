// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import {
  NO_EXCLUSIONS,
  getFeedExclusions,
  hideContent,
  isQuieted,
  muteUser,
  removeFollower,
  toFeedExclusions,
  unmuteUser,
  QUIET_COPY,
} from "@/lib/feed-quiet";

/**
 * The quiet controls: mute a person, hide one post or Shot, remove a
 * follower. Lighter than a block, and nobody is told.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const S = "44444444-4444-4444-8444-444444444444";

describe("what a feed leaves out", () => {
  it("reads the database's answer, as a row or a list of one", () => {
    const row = { muted: [A], posts: [P], shots: [S] };
    for (const data of [row, [row]]) {
      const ex = toFeedExclusions(data);
      expect([...ex.muted]).toEqual([A]);
      expect([...ex.posts]).toEqual([P]);
      expect([...ex.shots]).toEqual([S]);
    }
  });

  it("leaves nothing out when there is no answer or a bad one", () => {
    expect(toFeedExclusions(null)).toBe(NO_EXCLUSIONS);
    expect(toFeedExclusions([])).toBe(NO_EXCLUSIONS);
    const ex = toFeedExclusions({ muted: "nope", posts: [1, P, null], shots: undefined });
    expect(ex.muted.size).toBe(0);
    expect([...ex.posts]).toEqual([P]);
    expect(ex.shots.size).toBe(0);
  });

  it("still loads the feed when the lookup fails", async () => {
    const db = { rpc: async () => ({ data: null, error: { message: "down" } }) };
    expect(await getFeedExclusions(db as never)).toBe(NO_EXCLUSIONS);
  });

  it("leaves out a muted person's things, and a hidden thing, each of its own kind", () => {
    const ex = toFeedExclusions({ muted: [A], posts: [P], shots: [S] });
    expect(isQuieted({ id: "x", user_id: A }, "post", ex)).toBe(true);
    expect(isQuieted({ id: "x", user_id: A }, "shot", ex)).toBe(true);
    expect(isQuieted({ id: P, user_id: B }, "post", ex)).toBe(true);
    expect(isQuieted({ id: S, user_id: B }, "shot", ex)).toBe(true);
    // A hidden post's id says nothing about a Shot, and the other way round.
    expect(isQuieted({ id: P, user_id: B }, "shot", ex)).toBe(false);
    expect(isQuieted({ id: S, user_id: B }, "post", ex)).toBe(false);
    expect(isQuieted({ id: "x", user_id: B }, "post", ex)).toBe(false);
  });
});

describe("asking the database", () => {
  function db(answer: { data?: unknown; error?: unknown }) {
    const calls: unknown[][] = [];
    const chain: Record<string, unknown> = {};
    for (const k of ["delete", "eq", "select", "maybeSingle"]) {
      chain[k] = (...a: unknown[]) => {
        calls.push([k, ...a]);
        return chain;
      };
    }
    (chain as { then: unknown }).then = (res: (v: unknown) => unknown) => res({ data: answer.data ?? null, error: answer.error ?? null });
    return {
      calls,
      rpc: async (fn: string, args: unknown) => {
        calls.push(["rpc", fn, args]);
        return { data: answer.data ?? null, error: answer.error ?? null };
      },
      from: (t: string) => {
        calls.push(["from", t]);
        return chain;
      },
    };
  }

  it("hides one post or Shot", async () => {
    const d = db({});
    expect(await hideContent(d as never, "shot", S)).toBe(true);
    expect(d.calls[0]).toEqual(["rpc", "hide_content", { p_kind: "shot", p_content_id: S }]);
    expect(await hideContent(db({ error: { message: "no" } }) as never, "post", P)).toBe(false);
  });

  it("mutes through the function, and unmutes only its own row", async () => {
    const d = db({});
    expect(await muteUser(d as never, A)).toBe(true);
    expect(d.calls[0]).toEqual(["rpc", "mute_user", { p_target: A }]);

    const u = db({});
    expect(await unmuteUser(u as never, B, A)).toBe(true);
    expect(u.calls).toEqual([
      ["from", "muted_users"],
      ["delete"],
      ["eq", "muter_id", B],
      ["eq", "muted_id", A],
    ]);
  });

  it("counts a follower as removed only when one was", async () => {
    expect(await removeFollower(db({ data: true }) as never, A)).toBe(true);
    expect(await removeFollower(db({ data: false }) as never, A)).toBe(false);
    expect(await removeFollower(db({ data: true, error: { message: "x" } }) as never, A)).toBe(false);
  });
});

describe("the words", () => {
  it("say that nobody is told, where that is the point", () => {
    expect(QUIET_COPY.muted("@maya")).toBe("Muted @maya. They won't be told.");
    expect(QUIET_COPY.removed("@maya")).toBe("Removed @maya. They won't be told.");
  });
});

describe("where it is wired", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("the home feed leaves out muted people and hidden posts and Shots", () => {
    const home = read("src/app/(app)/home/page.tsx");
    expect(home).toContain("getFeedExclusions(supabase)");
    expect(home).toContain("for (const id of quiet.muted) blockedIds.add(id);");
    expect(home).toContain("quiet.posts.has(p.id)");
    expect(home).toContain("!quiet.shots.has(s.id)");
    expect(home).toContain("hiddenPostIds={[...quiet.posts]}");
  });

  it("later pages of the feed leave hidden posts out too", () => {
    const list = read("src/components/feed/FeedList.tsx");
    expect(list.match(/!hiddenPosts\.has\(p\.id\)/g)).toHaveLength(2);
  });

  it("the Shots reel leaves them out", () => {
    expect(read("src/app/(app)/shots/page.tsx")).toContain('.filter((s) => !isQuieted(s, "shot", quiet))');
  });

  it.each([
    ["src/components/feed/PostActionsSheet.tsx", "Not interested", "Mute @"],
    ["src/components/feed/ShotFeedCard.tsx", "Not interested", "Mute {username"],
    ["src/components/shots/ReelsFeed.tsx", "Not interested", "Mute {handle"],
  ])("%s offers both, on other people's things only", (file, a, b) => {
    const src = read(file);
    expect(src).toContain(a);
    expect(src).toContain(b);
  });

  it("a hidden post leaves the screen at once", () => {
    expect(read("src/components/feed/FeedCard.tsx")).toContain("onHide={() => setDeleted(true)}");
    expect(read("src/components/feed/ShotFeedCard.tsx")).toContain("hidden={gone}");
  });

  it("muted accounts can be found and undone in Privacy settings", () => {
    expect(read("src/app/(app)/settings/privacy/page.tsx")).toContain("<MutedList currentUserId={user.id} />");
  });
});

describe("removing a follower", () => {
  const rpc = vi.fn();
  const toast = vi.fn();
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    rpc.mockReset();
    toast.mockReset();
    rpc.mockResolvedValue({ data: true, error: null });
    vi.doMock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc, from: () => ({}) }) }));
    vi.doMock("@/components/ui/ToastProvider", () => ({ useToast: () => toast }));
    vi.doMock("@/components/profile/FollowButton", () => ({ FollowButton: () => null }));
    vi.doMock("next/link", () => ({
      default: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never),
    }));
    vi.doMock("@/components/ui/ConfirmDialog", () => ({
      ConfirmDialog: ({ open, onConfirm, title }: { open: boolean; onConfirm: () => void; title: string }) =>
        open ? createElement("button", { "data-confirm": "", onClick: onConfirm }, title) : null,
    }));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.resetModules();
  });

  const people = [
    { id: A, name: "Maya", username: "maya", hue: 1, avatarUrl: null, at: "2026-10-01T00:00:00Z" },
    { id: B, name: "Leo", username: "leo", hue: 2, avatarUrl: null, at: "2026-10-02T00:00:00Z" },
  ];
  async function mount(props: { ownerId: string; list: "followers" | "following" }) {
    const { PeopleList } = await import("@/components/profile/PeopleList");
    await act(async () =>
      root.render(
        createElement(PeopleList, {
          ...props,
          initial: people,
          total: 2,
          iFollowIds: [],
          currentUserId: "me",
          locked: false,
          lockedName: "x",
          pageSize: 60,
        }),
      ),
    );
  }
  const removeButtons = () => [...host.querySelectorAll("button")].filter((b) => b.textContent === "Remove");

  it("is offered on your own followers", async () => {
    await mount({ ownerId: "me", list: "followers" });
    expect(removeButtons()).toHaveLength(2);
  });

  it("is not offered on who you follow, or on anyone else's list", async () => {
    await mount({ ownerId: "me", list: "following" });
    expect(removeButtons()).toHaveLength(0);
    await mount({ ownerId: "someone-else", list: "followers" });
    expect(removeButtons()).toHaveLength(0);
  });

  it("asks first, then removes that one person and takes them off the list", async () => {
    await mount({ ownerId: "me", list: "followers" });
    await act(async () => removeButtons()[0].click());
    expect(rpc).not.toHaveBeenCalled();
    const confirm = host.querySelector("[data-confirm]") as HTMLButtonElement;
    expect(confirm.textContent).toBe("Remove @maya?");
    await act(async () => {
      confirm.click();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(rpc).toHaveBeenCalledWith("remove_follower", { p_follower: A });
    expect(host.textContent).not.toContain("Maya");
    expect(host.textContent).toContain("Leo");
    expect(toast).toHaveBeenCalledWith("Removed @maya. They won't be told.", "success");
  });

  it("keeps them on the list when the database refuses", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await mount({ ownerId: "me", list: "followers" });
    await act(async () => removeButtons()[0].click());
    await act(async () => {
      (host.querySelector("[data-confirm]") as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(host.textContent).toContain("Maya");
    expect(toast).toHaveBeenCalledWith(QUIET_COPY.removeFailed, "error");
  });
});
