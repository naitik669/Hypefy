import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACTIVITY_TABS,
  isActivityTab,
  loadActivityTab,
  loadHyped,
  loadWatched,
  newestFirst,
  postItem,
  shotItem,
  toActivityComment,
  type ActivityItem,
} from "@/lib/your-activity";
import { alreadyRecorded, forgetOneView, forgetRecordedWatches, forgetViews, recordWatch } from "@/lib/watched";

/**
 * Your interactions — what you hyped, said, watched and rehyped — and the
 * record of a Shot being watched that makes the third of those possible.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0132_shot_views_and_history.sql");

/** A stand-in database: answers per table, and records what it was asked. */
function fakeDb(rows: Record<string, { data: unknown[] }>) {
  const asked: { table: string; calls: [string, ...unknown[]][] }[] = [];
  return {
    asked,
    from(table: string) {
      const entry = { table, calls: [] as [string, ...unknown[]][] };
      asked.push(entry);
      const answer = Promise.resolve({ data: rows[table]?.data ?? [], error: null });
      const q: unknown = new Proxy(
        {},
        {
          get(_t, key: string) {
            if (key === "then") return answer.then.bind(answer);
            return (...args: unknown[]) => {
              entry.calls.push([key, ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
}

describe("turning a row into something to show", () => {
  it("a post uses its first image, and its words when it has none", () => {
    expect(postItem({ id: "p", image_urls: ["a.jpg", "b.jpg"], image_url: "old.jpg", caption: "hi", body: null }, "t")).toEqual({
      kind: "post", id: "p", caption: "hi", thumb: "a.jpg", media_url: null, at: "t",
    });
    expect(postItem({ id: "p", image_urls: null, image_url: null, caption: "  ", body: "the words" }, "t")).toMatchObject({
      caption: "the words", thumb: null,
    });
  });

  it("a Shot uses its poster, and falls back to its own film", () => {
    expect(shotItem({ id: "s", media_url: "clip.mp4", poster_url: "p.jpg", caption: "x" }, "t")).toMatchObject({
      kind: "shot", thumb: "p.jpg", media_url: "clip.mp4",
    });
    expect(shotItem({ id: "s", media_url: "clip.mp4", poster_url: null, caption: null }, "t")).toMatchObject({
      thumb: null, media_url: "clip.mp4", caption: null,
    });
  });

  it("something no longer there to see is nothing, not a broken tile", () => {
    // The join finds nothing for an archived, deleted or now-private post.
    expect(postItem(null, "t")).toBeNull();
    expect(postItem([], "t")).toBeNull();
    expect(shotItem(undefined, "t")).toBeNull();
  });

  it("the lists come together newest first, with the gaps dropped", () => {
    const a = { kind: "post", id: "a", caption: null, thumb: null, media_url: null, at: "2026-10-01" } as ActivityItem;
    const b = { ...a, id: "b", at: "2026-10-05" } as ActivityItem;
    expect(newestFirst([a, null], [b]).map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("what you hyped", () => {
  it("asks only for your own, and keeps the time you hyped it", async () => {
    const db = fakeDb({
      hypes: {
        data: [
          { target_type: "post", target_id: "p1", created_at: "2026-10-05" },
          { target_type: "shot", target_id: "s1", created_at: "2026-10-07" },
        ],
      },
      posts: { data: [{ id: "p1", image_url: "p.jpg", image_urls: null, caption: "post", body: null }] },
      shots: { data: [{ id: "s1", media_url: "c.mp4", poster_url: null, caption: "shot" }] },
    });
    const out = await loadHyped(db as never, "me");
    const hypes = db.asked.find((a) => a.table === "hypes")!;
    expect(hypes.calls).toContainEqual(["eq", "user_id", "me"]);
    expect(hypes.calls).toContainEqual(["in", "target_type", ["post", "shot"]]);
    // The Shot was hyped later, so it comes first.
    expect(out.map((i) => i.id)).toEqual(["s1", "p1"]);
    expect(out[0].at).toBe("2026-10-07");
  });

  it("asks for no posts or Shots when nothing was hyped", async () => {
    const db = fakeDb({});
    expect(await loadHyped(db as never, "me")).toEqual([]);
    expect(db.asked.map((a) => a.table)).toEqual(["hypes"]);
  });
});

describe("what you watched", () => {
  it("reads both records, by viewer, newest first", async () => {
    const db = fakeDb({
      post_views: { data: [{ created_at: "2026-10-01", posts: { id: "p1", image_url: "p.jpg", image_urls: null, caption: null, body: null } }] },
      shot_views: { data: [{ created_at: "2026-10-06", shots: { id: "s1", media_url: "c.mp4", poster_url: null, caption: null } }] },
    });
    const out = await loadWatched(db as never, "me");
    for (const table of ["post_views", "shot_views"]) {
      expect(db.asked.find((a) => a.table === table)!.calls).toContainEqual(["eq", "viewer_id", "me"]);
    }
    expect(out.map((i) => i.id)).toEqual(["s1", "p1"]);
  });

  it("a watched post that has since gone is left out", async () => {
    const db = fakeDb({ post_views: { data: [{ created_at: "t", posts: null }] } });
    expect(await loadWatched(db as never, "me")).toEqual([]);
  });
});

describe("one tab at a time", () => {
  it("only the open tab is fetched", async () => {
    for (const [tab, tables] of [
      ["hypes", ["hypes"]],
      ["comments", ["comments"]],
      ["watched", ["post_views", "shot_views"]],
      ["rehypes", ["reposts", "shot_reposts"]],
    ] as const) {
      const db = fakeDb({});
      await loadActivityTab(db as never, "me", tab);
      expect(db.asked.map((a) => a.table).sort()).toEqual([...tables].sort());
    }
  });

  it("an address nobody typed on purpose falls back to hypes", () => {
    expect(ACTIVITY_TABS).toEqual(["hypes", "comments", "watched", "rehypes"]);
    expect(isActivityTab("watched")).toBe(true);
    expect(isActivityTab("saved")).toBe(false);
    expect(isActivityTab(undefined)).toBe(false);
  });

  it("a comment with no words, or nothing to point at, is not listed", () => {
    const base = { id: "c", created_at: "t", post_id: null, shot_id: null };
    expect(toActivityComment({ ...base, body: "   " })).toBeNull();
    expect(toActivityComment({ ...base, body: "hi" })).toBeNull();
    expect(toActivityComment({ ...base, body: "hi", shot_id: "s1" })).toMatchObject({ href: "/shots/s1", on: "Shot" });
    expect(toActivityComment({ ...base, body: "hi", post_id: "p1" })).toMatchObject({ href: "/p/p1", on: "post" });
  });
});

describe("recording that a Shot was watched", () => {
  beforeEach(() => forgetRecordedWatches());

  it("writes it once, however many times the reel comes back", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ insert }) };
    await recordWatch(db as never, "s1", "me");
    await recordWatch(db as never, "s1", "me");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({ shot_id: "s1", viewer_id: "me" });
    expect(alreadyRecorded("s1")).toBe(true);
  });

  it("records nothing for someone signed out", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    await recordWatch({ from: () => ({ insert }) } as never, "s1", null);
    expect(insert).not.toHaveBeenCalled();
  });

  it("never throws: it sits behind every reel", async () => {
    const db = { from: () => ({ insert: async () => { throw new Error("offline"); } } ) };
    await expect(recordWatch(db as never, "s2", "me")).resolves.toBeUndefined();
  });
});

describe("forgetting", () => {
  it("says how many went", async () => {
    const rpc = vi.fn(async () => ({ data: 12, error: null }));
    expect(await forgetViews({ rpc } as never, "all")).toBe(12);
    expect(rpc).toHaveBeenCalledWith("forget_views", { p_kind: "all" });
  });
  it("a refusal is null, not a number", async () => {
    expect(await forgetViews({ rpc: async () => ({ data: null, error: {} }) } as never, "shot")).toBeNull();
  });
  it("one at a time says whether it worked", async () => {
    expect(await forgetOneView({ rpc: async () => ({ error: null }) } as never, "shot", "s1")).toBe(true);
    expect(await forgetOneView({ rpc: async () => ({ error: {} }) } as never, "post", "p1")).toBe(false);
  });
});

describe("what the database guarantees", () => {
  it("a Shot is counted once per person per day, as a post already is", () => {
    expect(sql).toContain("primary key (shot_id, viewer_id, viewed_on)");
    expect(sql).toContain("viewed_on date not null default current_date");
  });

  it("only the watcher and the author can see a watch", () => {
    const policy = sql.slice(sql.indexOf('create policy "shot_views read own or as author"'));
    expect(policy.slice(0, 300)).toContain("viewer_id = (select auth.uid())");
    expect(policy.slice(0, 300)).toContain("s.user_id = (select auth.uid())");
    expect(sql).toContain("with check (viewer_id = (select auth.uid()))");
  });

  it("clearing reaches only your own rows, and nothing else", () => {
    expect(sql).toContain("delete from public.post_views where viewer_id = v_me;");
    expect(sql).toContain("delete from public.shot_views where viewer_id = v_me;");
    expect(sql).toContain("raise exception 'Unknown kind: %', p_kind");
    // The rows go, rather than being flagged: being forgotten should leave nothing.
    expect(sql).not.toContain("hidden_at");
  });

  it("the watch goes when the Shot or the account does", () => {
    expect(sql).toContain("references public.shots (id) on delete cascade");
    expect(sql).toContain("references auth.users (id) on delete cascade");
  });
});

describe("the screen", () => {
  const screen = read("src/components/profile/ActivityScreen.tsx");

  it("has the four tabs, each its own address", () => {
    expect(screen).toContain("href={`/activity?tab=${id}`}");
    expect(screen).toContain('role="tablist"');
    for (const id of ACTIVITY_TABS) expect(screen).toContain(`id: "${id}"`);
  });

  it("each list undoes its own thing where it is listed", () => {
    expect(screen).toContain('supabase.rpc("toggle_hype"');
    expect(screen).toContain("forgetOneView(supabase, item.kind, item.id)");
    expect(screen).toContain("setRehype(supabase as never, userId, item.kind, item.id, false)");
    expect(screen).toContain('.update({ deleted_at: new Date().toISOString() })');
  });

  it("a comment that could not be deleted says so instead of vanishing", () => {
    expect(screen).toContain('.select("id")');
    expect(screen).toContain("if (error || !data?.length) {");
  });

  it("clearing everything is confirmed, and says what else it costs", () => {
    expect(screen).toContain("<ConfirmDialog");
    expect(screen).toContain("Clear your watch history?");
    expect(screen).toContain("avoid repeating itself");
  });

  it("the old address still lands somewhere, and Settings points at the new one", () => {
    expect(read("src/app/(app)/settings/activity/page.tsx")).toContain('redirect("/activity")');
    expect(read("src/app/(app)/settings/page.tsx")).toContain('href: "/activity"');
  });

  it("a reel counts as watched only once it is the one playing", () => {
    const reels = read("src/components/shots/ReelsFeed.tsx");
    expect(reels).toContain("if (!isActive || !playing || !currentUserId) return;");
    expect(reels).toContain("setTimeout(() => void recordWatch(supabase, reel.id, currentUserId), WATCH_MS)");
  });
});
