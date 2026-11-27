import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPeopleSuggestions } from "@/lib/people-suggestions";

/**
 * The loader, driven with a stand-in database.
 *
 * It takes the client as an argument, so the test calls it rather than
 * reading it. The stand-in applies eq / neq / in filters to fixture rows the
 * way PostgREST would, so a filter on the wrong column returns the wrong
 * rows here too.
 */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeDb(tables: Tables, opts: { failTable?: string; blocked?: string[] } = {}) {
  const calls: { table: string; filters: string[] }[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const filters: string[] = [];
    calls.push({ table, filters });
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        filters.push(`eq:${col}`);
        rows = rows.filter((r) => r[col] === v);
        return q;
      },
      neq: (col: string, v: unknown) => {
        filters.push(`neq:${col}`);
        rows = rows.filter((r) => r[col] !== v);
        return q;
      },
      in: (col: string, vs: unknown[]) => {
        filters.push(`in:${col}`);
        rows = rows.filter((r) => vs.includes(r[col]));
        return q;
      },
      order: () => q,
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return q;
      },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(
          opts.failTable === table ? { data: null, error: { message: "boom" } } : { data: rows, error: null }
        ).then(ok, bad),
    };
    return q;
  };
  const rpc = (name: string) =>
    Promise.resolve(
      name === "blocked_either_way" ? { data: opts.blocked ?? [], error: null } : { data: null, error: { message: "no" } }
    );
  return { client: { from, rpc } as unknown as SupabaseClient, calls };
}

const NOW = Date.parse("2026-11-27T09:00:00Z");
const p = (id: string, extra: Row = {}): Row => ({
  id,
  display_name: id,
  username: id,
  avatar_hue: 10,
  avatar_url: null,
  accent_id: null,
  is_verified: false,
  created_at: "2026-06-01T00:00:00Z",
  last_seen_at: null,
  profile_completed: true,
  suspended_at: null,
  suspended_until: null,
  ...extra,
});
const follow = (follower_id: string, following_id: string) => ({ follower_id, following_id });
const hype = (user_id: string, target_id: string, target_type = "post") => ({ user_id, target_id, target_type, created_at: "x" });

/** Naitik's network on 26 Nov, cut down to the people that matter. */
function network() {
  return {
    profiles: [
      p("me"),
      p("anup"),
      p("kurkure"),
      p("spidey"),
      p("chugli"),
      p("tahaa"),
      p("blocker"),
      p("asked"),
      p("half", { profile_completed: false }),
    ],
    follows: [
      follow("me", "anup"),
      follow("me", "kurkure"),
      follow("anup", "spidey"),
      follow("kurkure", "spidey"),
      follow("spidey", "me"),
      follow("tahaa", "spidey"),
    ],
    follow_requests: [{ requester_id: "me", target_id: "asked" }],
    hypes: [
      hype("me", "p1"),
      hype("me", "p2"),
      hype("chugli", "p1"),
      hype("chugli", "p2"),
      hype("spidey", "p1"),
      hype("tahaa", "p9"),
    ],
  };
}

describe("loadPeopleSuggestions", () => {
  it("ranks the real shape: mutuals and follows-you first, then shared hypes, then the rest", async () => {
    const { client } = fakeDb(network(), { blocked: ["blocker"] });
    const out = await loadPeopleSuggestions(client, "me", NOW);
    expect(out.map((x) => x.id)).toEqual(["spidey", "chugli", "tahaa"]);
    expect(out[0].reason).toBe("2 mutuals");
    expect(out[0].mutuals.map((m) => m.id).sort()).toEqual(["anup", "kurkure"]);
    expect(out[1].reason).toBe("Hypes what you hype");
  });

  it("leaves out who you follow, who you asked, who is blocked and who never finished", async () => {
    const { client } = fakeDb(network(), { blocked: ["blocker"] });
    const out = (await loadPeopleSuggestions(client, "me", NOW)).map((x) => x.id);
    for (const id of ["me", "anup", "kurkure", "asked", "blocker", "half"]) expect(out).not.toContain(id);
  });

  it("counts followers for the fallback line from the follows table", async () => {
    const { client } = fakeDb(network());
    const out = await loadPeopleSuggestions(client, "me", NOW);
    // blocker has nothing in common with me and nobody follows them.
    expect(out.find((x) => x.id === "blocker")?.reason).toBe("Say hi first");
  });

  it("reads each list by the right column", async () => {
    const { client, calls } = fakeDb(network());
    await loadPeopleSuggestions(client, "me", NOW);
    const seen = calls.map((c) => `${c.table}(${c.filters.join(",")})`);
    expect(seen).toEqual(
      expect.arrayContaining([
        "follows(eq:follower_id)",
        "follows(eq:following_id)",
        "follow_requests(eq:requester_id)",
        "hypes(eq:user_id)",
        "profiles(eq:profile_completed,neq:id)",
        "follows(in:follower_id)",
        "hypes(in:target_id,neq:user_id)",
        "follows(in:following_id)",
      ])
    );
  });

  it("a failed candidate read is an error, not an empty page that says nobody is here", async () => {
    const { client } = fakeDb(network(), { failTable: "profiles" });
    await expect(loadPeopleSuggestions(client, "me", NOW)).rejects.toBeTruthy();
  });

  it("someone with no follows and no hypes still gets everyone, in a stable order", async () => {
    const { client } = fakeDb({ profiles: [p("me"), p("b"), p("a")], follows: [], hypes: [], follow_requests: [] });
    const out = await loadPeopleSuggestions(client, "me", NOW);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
