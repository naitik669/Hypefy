import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cleanTag, findTag, splitTop, tagHref, type TagPost } from "@/lib/tag-lookup";
import { inOrder, loadYourActivity, toActivityComment } from "@/lib/your-activity";

/**
 * A page per hashtag, and a page of what you have hyped and said.
 */

/** A stand-in database: answers per table, and records what it was asked. */
function fakeDb(rows: Record<string, { data: unknown[]; count?: number }>) {
  const asked: { table: string; calls: [string, ...unknown[]][] }[] = [];
  return {
    asked,
    from(table: string) {
      const entry = { table, calls: [] as [string, ...unknown[]][] };
      asked.push(entry);
      const answer = Promise.resolve({ data: rows[table]?.data ?? [], count: rows[table]?.count ?? null, error: null });
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

const post = (id: string, hype_count = 0): TagPost => ({
  id,
  user_id: "u",
  image_url: null,
  image_urls: null,
  caption: id,
  body: null,
  hype_count,
});

describe("a hashtag from a link", () => {
  it("is put in the form tags are stored in", () => {
    expect(cleanTag("Art")).toBe("art");
    expect(cleanTag("%23GoldenHour")).toBe("goldenhour");
    expect(cleanTag("#fyp_2026")).toBe("fyp_2026");
    expect(cleanTag("कला")).toBe("कला");
  });

  it("is refused when it is not a hashtag", () => {
    for (const bad of ["", "#", "two words", "a-b", "a.b", "a/b", "x".repeat(61), "%E0%A4%A", "<script>"]) {
      expect(cleanTag(bad)).toBeNull();
    }
  });

  it("has one address, however it was written", () => {
    expect(tagHref("#Art")).toBe("/tag/art");
    expect(tagHref("कला")).toBe(`/tag/${encodeURIComponent("कला")}`);
  });
});

describe("top and recent", () => {
  it("has no Top until there are enough posts for it to mean something", () => {
    const few = [post("a", 9), post("b", 5), post("c")];
    expect(splitTop(few)).toEqual({ top: [], recent: few });
  });

  it("takes the three most hyped out, and leaves the rest newest first", () => {
    const posts = [post("a", 1), post("b", 9), post("c"), post("d", 5), post("e", 7), post("f"), post("g", 2)];
    const { top, recent } = splitTop(posts);
    expect(top.map((p) => p.id)).toEqual(["b", "e", "d"]);
    expect(recent.map((p) => p.id)).toEqual(["a", "c", "f", "g"]);
  });

  it("never calls an unhyped post Top", () => {
    const posts = Array.from({ length: 8 }, (_, i) => post(`p${i}`, i === 0 ? 3 : 0));
    expect(splitTop(posts).top.map((p) => p.id)).toEqual(["p0"]);
  });
});

describe("finding what is under a tag", () => {
  it("asks both tables for rows carrying the tag, live ones, newest first", async () => {
    const db = fakeDb({ posts: { data: [post("a")], count: 1 }, shots: { data: [], count: 0 } });
    const page = (await findTag(db as never, "%23Art"))!;
    expect(page.tag).toBe("art");
    for (const a of db.asked) {
      expect(a.calls).toContainEqual(["contains", "hashtags", ["art"]]);
      expect(a.calls).toContainEqual(["is", "removed_at", null]);
    }
    expect(page.postCount).toBe(1);
    expect(page.recent.map((p) => p.id)).toEqual(["a"]);
  });

  it("is a page even when nobody has used the tag", async () => {
    const page = (await findTag(fakeDb({}) as never, "brandnew"))!;
    expect(page).toMatchObject({ tag: "brandnew", shots: [], top: [], recent: [], shotCount: 0, postCount: 0 });
  });

  it("is nothing, and asks nothing, for something that is not a tag", async () => {
    const db = fakeDb({});
    expect(await findTag(db as never, "not a tag")).toBeNull();
    expect(db.asked).toHaveLength(0);
  });

  it("is where every tapped tag now goes", () => {
    for (const f of [
      "src/components/ui/RichPostText.tsx",
      "src/components/settings/HashtagManager.tsx",
      "src/components/discover/DiscoverView.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("tagHref(");
      expect(src).not.toMatch(/search\?q=(%23|\$\{encodeURIComponent\(`#)/);
    }
  });
});

describe("your activity", () => {
  it("keeps the order things were hyped in, and drops what has since gone", () => {
    const rows = [{ id: "b" }, { id: "a" }];
    expect(inOrder(["a", "gone", "b"], rows)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("says where a comment is", () => {
    expect(toActivityComment({ id: "c1", body: " nice ", post_id: "p1", shot_id: null, created_at: "t" })).toEqual({
      id: "c1",
      body: "nice",
      href: "/p/p1",
      on: "post",
      at: "t",
    });
    expect(toActivityComment({ id: "c2", body: "wow", post_id: null, shot_id: "s1", created_at: "t" })!.href).toBe("/shots/s1");
  });

  it("leaves out a comment with no words or no home", () => {
    expect(toActivityComment({ id: "c", body: "  ", post_id: "p", shot_id: null, created_at: "t" })).toBeNull();
    expect(toActivityComment({ id: "c", body: "x", post_id: null, shot_id: null, created_at: "t" })).toBeNull();
  });

  it("reads only this person's hypes and live comments", async () => {
    const db = fakeDb({
      hypes: {
        data: [
          { target_type: "shot", target_id: "s1" },
          { target_type: "post", target_id: "p2" },
          { target_type: "post", target_id: "p1" },
        ],
      },
      posts: { data: [{ id: "p1" }, { id: "p2" }] },
      shots: { data: [{ id: "s1" }] },
      comments: { data: [{ id: "c1", body: "hi", post_id: "p1", shot_id: null, created_at: "t" }] },
    });
    const out = await loadYourActivity(db as never, "me");
    const hypes = db.asked.find((a) => a.table === "hypes")!;
    expect(hypes.calls).toContainEqual(["eq", "user_id", "me"]);
    expect(hypes.calls).toContainEqual(["in", "target_type", ["post", "shot"]]);
    const comments = db.asked.find((a) => a.table === "comments")!;
    expect(comments.calls).toContainEqual(["eq", "user_id", "me"]);
    expect(comments.calls).toContainEqual(["is", "deleted_at", null]);
    expect(comments.calls).toContainEqual(["is", "removed_at", null]);
    // Most recently hyped first.
    expect(out.hypedPosts.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(out.hypedShots.map((s) => s.id)).toEqual(["s1"]);
    expect(out.comments).toHaveLength(1);
  });

  it("asks for no posts or Shots when nothing was hyped", async () => {
    const db = fakeDb({});
    const out = await loadYourActivity(db as never, "me");
    expect(db.asked.map((a) => a.table).sort()).toEqual(["comments", "hypes"]);
    expect(out).toEqual({ hypedPosts: [], hypedShots: [], comments: [] });
  });

  it("is in Settings, and only for someone signed in", () => {
    expect(readFileSync("src/app/(app)/settings/page.tsx", "utf8")).toContain('href: "/settings/activity"');
    const page = readFileSync("src/app/(app)/settings/activity/page.tsx", "utf8");
    expect(page).toContain('if (!user) redirect("/signin");');
    expect(page).toContain("loadYourActivity(supabase, user.id)");
  });
});
