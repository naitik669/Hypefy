import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_PINNED_POSTS, setCommentPinned, setPinned } from "@/lib/post-controls";
import { SEARCH_MIN, around } from "@/components/messages/ChatSearch";
import { threadOf } from "@/components/feed/CommentsSheet";

/**
 * Pinning a post to a profile and a comment to a post, choosing who can
 * reach you by mentioning you, and finding something said in a chat.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0133_pinning_mentions_and_chat_search.sql");

function client(error: unknown = null) {
  const rpc = vi.fn(async () => ({ data: null, error }));
  return { rpc, client: { rpc } as never };
}

describe("pinning a post", () => {
  it("asks the one function allowed to do it", async () => {
    const a = client();
    expect(await setPinned(a.client, "p1", true)).toBeNull();
    expect(a.rpc).toHaveBeenCalledWith("set_post_pinned", { p_id: "p1", p_pinned: true });
  });

  it("the cap is said in words a person can act on", async () => {
    const msg = await setPinned(client({ message: "You can pin 3 posts. Unpin one first." }).client, "p1", true);
    expect(msg).toBe(`You can pin ${MAX_PINNED_POSTS} posts. Unpin one first.`);
  });

  it("any other refusal does not leak the server's words", async () => {
    const msg = await setPinned(client({ message: "permission denied for table posts" }).client, "p1", true);
    expect(msg).not.toContain("permission denied");
    expect(await setPinned(client({ message: "x" }).client, "p1", false)).toContain("unpin");
  });

  it("the app and the database agree on how many", () => {
    expect(MAX_PINNED_POSTS).toBe(3);
    expect(sql).toContain("returns integer language sql immutable as $$ select 3 $$");
    expect(read("src/components/profile/ProfileGrids.tsx")).toContain("export const MAX_PINNED = 3;");
  });

  it("only the owner, and never something archived or taken down", () => {
    expect(sql).toContain("where id = p_id and user_id = v_me and archived_at is null and removed_at is null");
    expect(sql).toContain("raise exception 'Not yours to pin'");
    // Not the client's column to write.
    expect(sql).toContain("revoke update (pinned_at) on public.posts from authenticated, anon;");
  });

  it("a profile asks for its pinned posts apart from the paged grid", () => {
    const grids = read("src/components/profile/ProfileGrids.tsx");
    expect(grids).toContain('.not("pinned_at", "is", null)');
    expect(grids).toContain('.order("pinned_at", { ascending: false })');
    // Shown once, at the top, not again in its own place.
    expect(grids).toContain("const rest = items.filter((p) => !pinnedIds.has(p.id));");
    expect(grids).toContain("aria-label=\"Pinned to the profile\"");
  });
});

describe("pinning a comment", () => {
  const node = (id: string, over: Record<string, unknown> = {}) => ({
    id, user_id: "u", body: id, image_url: null, created_at: "2026-01-0" + id, updated_at: null,
    pinned_at: null, parent_id: null, hyped: false, hypeCount: 0, reported: false, profiles: null, ...over,
  });

  it("the pinned one reads first, whenever it was written", () => {
    const threads = threadOf([node("1"), node("2"), node("3", { pinned_at: "2026-02-01" })]);
    expect(threads.map((t) => t.root.id)).toEqual(["3", "1", "2"]);
  });

  it("everything else keeps the order it was posted in", () => {
    expect(threadOf([node("1"), node("2"), node("3")]).map((t) => t.root.id)).toEqual(["1", "2", "3"]);
  });

  it("a reply stays under its root, pinned or not", () => {
    const threads = threadOf([node("1", { pinned_at: "x" }), node("2"), node("2a", { parent_id: "2" })]);
    expect(threads.map((t) => [t.root.id, t.replies.map((r) => r.id)])).toEqual([["1", []], ["2", ["2a"]]]);
  });

  it("it is the author of the post who decides, not the author of the comment", () => {
    expect(sql).toContain("raise exception 'Only the author can pin a comment'");
    expect(read("src/components/feed/CommentsSheet.tsx")).toContain("{currentUserId === postOwnerId && (");
  });

  it("one at a time: pinning a second lets go of the first", () => {
    expect(sql).toContain("update public.comments set pinned_at = null\n   where pinned_at is not null");
    expect(read("src/components/feed/CommentsSheet.tsx")).toContain("n.pinned_at\n              ? { ...n, pinned_at: null }");
  });

  it("the call says whether it worked", async () => {
    expect(await setCommentPinned(client().client, "c1", true)).toBe(true);
    expect(await setCommentPinned(client({}).client, "c1", true)).toBe(false);
  });
});

describe("who can reach you by mentioning you", () => {
  it("three answers, and the database refuses a fourth", () => {
    expect(sql).toContain("check (mention_privacy in ('everyone', 'following', 'nobody'))");
    expect(sql).toContain("default 'everyone'");
  });

  it("'people you follow' means the one mentioned follows the one writing", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.mention_allowed"));
    expect(fn).toContain("f.follower_id = p_target and f.following_id = p_actor");
    expect(fn).toContain("when 'nobody' then false");
  });

  it("both mention notifications ask before they are sent", () => {
    for (const which of ["handle_post_mentions", "handle_shot_mentions"]) {
      const fn = sql.slice(sql.indexOf(`create or replace function public.${which}`));
      expect(fn.slice(0, 900)).toContain("public.mention_allowed(v_target, new.user_id)");
    }
  });

  it("the setting is nobody else's business, and its owner can still read it", () => {
    // Not in the public column grant (0130), so it comes with the owner's own fields.
    expect(read("supabase/migrations/0130_private_profile_columns.sql")).not.toContain("mention_privacy");
    expect(sql).toContain("'mention_privacy', p.mention_privacy");
    expect(read("src/lib/profile.ts")).toContain("mentionPrivacy:");
  });

  it("the Privacy screen offers all three, and says what the setting actually does", () => {
    const s = read("src/components/settings/PrivacySettings.tsx");
    expect(s).toContain('title="Who can notify you by mentioning you"');
    for (const v of ["everyone", "following", "nobody"]) expect(s).toContain(`value: "${v}"`);
    expect(s).toContain('role="radiogroup"');
  });
});

describe("finding a message", () => {
  it("shows the words around the match, not the start of a long message", () => {
    const long = "a".repeat(80) + "needle" + "b".repeat(80);
    const out = around(long, "needle");
    expect(out).toContain("needle");
    expect(out.length).toBeLessThan(90);
    expect(out.startsWith("…")).toBe(true);
  });

  it("a short message is shown whole", () => {
    expect(around("just this", "this")).toBe("just this");
    // No match (the list is stale for a keystroke) is not a crash.
    expect(around("just this", "zzz")).toBe("just this");
  });

  it("waits for enough letters to be worth searching", () => {
    expect(SEARCH_MIN).toBe(2);
    const s = read("src/components/messages/ChatSearch.tsx");
    expect(s).toContain("if (tooShort) return;");
    // An answer to older words is never shown against newer ones.
    expect(s).toContain("const results = !tooShort && answer?.q === term ? answer.rows : null;");
  });

  it("the search runs over the whole chat, not the part on screen", () => {
    expect(read("src/components/messages/ChatSearch.tsx")).toContain(
      'supabase\n        .rpc("search_messages", { p_conversation_id: conversationId, p_q: term })',
    );
  });

  it("the row rule is what decides who may read a chat, so the search keeps it", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.search_messages"));
    expect(fn).not.toContain("security definer");
    expect(fn).toContain("and not m.is_unsent");
    expect(fn).toContain("and m.removed_at is null");
    // Nothing comes back for an empty search.
    expect(fn).toContain("btrim(p_q) <> ''");
  });

  it("reaching a result fetches back to it, but only so far", () => {
    const chat = read("src/components/messages/RealChatView.tsx");
    expect(chat).toContain("export const SEARCH_REACH_PAGES = 12;");
    expect(chat).toContain("if (!hasMore) break;");
    expect(chat).toContain("That message is further back than this can reach.");
    // And it is lit when it lands.
    expect(chat).toContain('data-msg-id={m.id}');
    expect(chat).toContain("animate-found");
    expect(read("src/app/globals.css")).toContain(".animate-found { animation: none;");
  });
});
