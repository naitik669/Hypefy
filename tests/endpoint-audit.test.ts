import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * What the audit of 0135 fixed, held in place.
 *
 * The findings were about reach rather than bugs: endpoints exposed wider
 * than anything calls them, and reads with no ceiling on how much they ask
 * for. Neither shows up as a failure until there is enough data for it to.
 */

const read = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
const sql = read("supabase/migrations/0135_endpoint_audit_hardening.sql");

describe("what a signed-out caller may reach", () => {
  it("cannot ask whether an account is private, or whether it is an admin", () => {
    expect(sql).toContain("revoke execute on function public.can_see_profile(uuid) from anon;");
    expect(sql).toContain("revoke execute on function public.is_admin() from anon;");
  });

  it("can still ask the minimum build, which is asked before anyone signs in", () => {
    expect(sql).not.toContain("min_app_build() from anon");
  });
});

describe("endpoints nothing calls", () => {
  const dead = ["age_ok()", "rehype_route(text, uuid, uuid)", "top_share_targets(integer)"];

  it("are closed to signed-in callers too", () => {
    for (const fn of dead) {
      expect(sql).toContain(`revoke execute on function public.${fn} from authenticated, anon;`);
    }
  });

  it("are closed, not dropped — turning one back on is a grant", () => {
    expect(sql).not.toContain("drop function");
  });

  it("the helpers that policies lean on keep their grant", () => {
    // Policy expressions are checked against the calling role, so revoking
    // these would refuse every read of the table they guard.
    for (const keep of ["can_see_profile(uuid) from authenticated", "is_conv_member", "can_read_chat_media"]) {
      expect(sql).not.toContain(`revoke execute on function public.${keep}`);
    }
  });
});

describe("a pinned search_path", () => {
  it("covers the four that had none", () => {
    for (const fn of [
      "max_pinned_posts",
      "collection_items_stamp",
      "collections_guard_owner_fields",
      "playlist_member_cap",
    ]) {
      expect(sql).toContain(`alter function public.${fn}() set search_path to 'public';`);
    }
  });
});

describe("auth.uid() in a policy", () => {
  it("is wrapped so it is read once for the statement, not once per row", () => {
    const wrapped = sql.match(/\(select auth\.uid\(\)\)/g) ?? [];
    expect(wrapped.length).toBeGreaterThanOrEqual(7);
    // No bare call left behind in the rewritten policies: every one is
    // preceded by `select `, which is what makes it a scalar subquery.
    const policies = sql.slice(sql.indexOf("alter policy"), sql.indexOf("-- ── 5."));
    expect(policies).not.toMatch(/(?<!select )auth\.uid\(\)/);
  });
});

describe("the keys an account delete cascades through", () => {
  it("each has an index, so removing a person is not a table scan apiece", () => {
    for (const idx of [
      "post_views_viewer_idx",
      "poll_votes_voter_idx",
      "note_reactions_reactor_idx",
      "note_hypes_hyper_idx",
      "oneshots_sender_idx",
      "close_friends_friend_idx",
      "favorites_friend_idx",
    ]) {
      expect(sql).toContain(`create index if not exists ${idx}`);
    }
  });
});

describe("reads with a ceiling", () => {
  it("the Hypers prompt asks for a page of each direction, not the whole graph", () => {
    const src = read("src/components/feed/AddHypersPrompt.tsx");
    expect(src).toContain("const CANDIDATES = 60;");
    expect(src.match(/\.limit\(CANDIDATES\)/g) ?? []).toHaveLength(2);
    expect(src.match(/\.order\("created_at", \{ ascending: false \}\)/g) ?? []).toHaveLength(2);
  });

  it("a chat's catch-up cannot ask for the whole thread", () => {
    // With nothing on screen the reduce falls back to 1970, so an uncapped
    // catch-up asked for every message the conversation had ever held.
    const src = read("src/components/messages/RealChatView.tsx");
    const catchUp = src.slice(src.indexOf("function catchUp()"), src.indexOf("function catchUp()") + 900);
    expect(catchUp).toContain('.gt("created_at", latest)');
    expect(catchUp).toContain(".limit(MSG_PAGE)");
  });
});
