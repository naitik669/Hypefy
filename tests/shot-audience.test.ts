import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHOW_AUDIENCES, isRestricted, readAudience } from "@/lib/show-audience";

/**
 * A Shot can go to your Hypers rather than to everybody.
 *
 * Shows have had this since they existed and Shots never did: every Shot
 * was public to whoever could already see you, with no say in it.
 *
 * The interesting part is not the column. It is that close_friends has
 * one policy — you may read rows where user_id is you — so nobody can see
 * the lists they are ON. An EXISTS over it written inline in the shots
 * policy is evaluated as the VIEWER, finds nothing, and returns false for
 * exactly the people the Shot is for.
 *
 * The first draft did that. A dry run showed a hypers-only Shot visible
 * to its author and to nobody else at all, the intended Hyper included:
 * a privacy feature that looked like it worked and did not. is_hyper_of
 * is a definer for the same reason can_see_show is.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const m = read("supabase/migrations/0210_shots_have_an_audience.sql");
const preview = read("src/components/create/ShotPreview.tsx");
const up = read("src/components/upload/UploadProvider.tsx");

describe("the check has to outrank the viewer's own RLS", () => {
  it("is_hyper_of is a security definer", () => {
    const fn = m.slice(m.indexOf("function public.is_hyper_of"), m.indexOf("revoke all on function"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path to 'public'");
  });

  it("and the policy calls it rather than reading close_friends inline", () => {
    // The inline version is the bug. It reads as the viewer, who cannot
    // see the author's list, so it is false for the very people it is
    // meant to be true for.
    const policy = m.slice(m.indexOf('create policy "shots: anyone can read"'));
    expect(policy).toContain("public.is_hyper_of(shots.user_id)");
    expect(policy).not.toContain("from public.close_friends");
  });

  it("the helper is closed to anon before being granted", () => {
    expect(m).toContain("revoke all on function public.is_hyper_of(uuid) from public, anon");
    expect(m).toContain("grant execute on function public.is_hyper_of(uuid) to authenticated");
  });

  it("and it answers one question rather than handing back a list", () => {
    // Returning somebody's Hypers would be a way to read a private list
    // through a function written to protect it.
    const fn = m.slice(m.indexOf("function public.is_hyper_of"), m.indexOf("revoke all on function"));
    expect(fn).toContain("returns boolean");
    expect(fn).toContain("select exists (");
  });
});

describe("the rule is in the policy, not in a query", () => {
  it("the select policy carries it", () => {
    // Three places read shots. A WHERE added to each is an audience that
    // holds until somebody writes a fourth.
    expect(m).toContain('create policy "shots: anyone can read"');
    expect(m).toContain("audience = 'everyone'");
  });

  it("and every clause that already guarded a Shot is still there", () => {
    // This adds an AND beside them; it does not rewrite the rule.
    const policy = m.slice(m.indexOf('create policy "shots: anyone can read"'));
    expect(policy).toContain("archived_at is null");
    expect(policy).toContain("removed_at is null");
    expect(policy).toContain("coalesce(p.is_private, false)");
    expect(policy).toContain("from public.follows f");
  });

  it("narrowing never widens", () => {
    // A Hyper who cannot see a private account they do not follow still
    // cannot see this: the private clause sits above, joined by AND.
    const policy = m.slice(m.indexOf('create policy "shots: anyone can read"'));
    const privateAt = policy.indexOf("coalesce(p.is_private, false)");
    const hyperAt = policy.indexOf("public.is_hyper_of");
    expect(privateAt).toBeGreaterThan(-1);
    expect(hyperAt).toBeGreaterThan(privateAt);
  });

  it("and an unknown audience cannot be stored", () => {
    expect(m).toContain("check (audience in ('everyone', 'hypers'))");
  });
});

describe("the same two rooms as everything else", () => {
  it("not a third vocabulary for Shots", () => {
    expect(SHOW_AUDIENCES).toEqual(["everyone", "hypers"]);
  });

  it("and an unknown value reads as the open one", () => {
    // A row written by a newer client must read as something rather than
    // take the page down.
    expect(readAudience("whatever")).toBe("everyone");
    expect(readAudience(null)).toBe("everyone");
    expect(isRestricted("hypers")).toBe(true);
    expect(isRestricted("everyone")).toBe(false);
  });
});

describe("the composer", () => {
  it("offers the choice", () => {
    expect(preview).toContain('aria-label="Who can see this Shot"');
    expect(preview).toContain('setAudience("hypers")');
    expect(preview).toContain('setAudience("everyone")');
  });

  it("says which is chosen, for a reader too", () => {
    expect(preview).toContain("aria-pressed={active}");
  });

  it("and the upload writes what was chosen, not a default", () => {
    expect(preview).toContain("audience: room,");
    expect(up).toContain("audience: a.audience,");
  });
});
