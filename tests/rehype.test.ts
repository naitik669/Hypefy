import { describe, it, expect } from "vitest";
import { isRehyped, rehypedBy, setRehype } from "@/lib/rehype";

/**
 * Rehype is one act on two kinds of thing, stored in two tables. The ways it
 * goes wrong quietly: the wrong table for a Shot, a double tap reported as a
 * failure, the database's refusal of a private account's post shown as a
 * generic error, or a name-less account leaving an empty label.
 */

type Err = { message: string; code?: string } | null;
type Call = { op: "insert" | "delete" | "select"; table: string; row?: Record<string, string>; filters?: [string, string][] };

function fakeDb(opts: { insertError?: Err; deleteError?: Err; selectRow?: unknown; throwOn?: "insert" | "delete" | "select" } = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, string>) {
          calls.push({ op: "insert", table, row });
          if (opts.throwOn === "insert") return Promise.reject(new Error("network"));
          return Promise.resolve({ error: opts.insertError ?? null });
        },
        delete() {
          const filters: [string, string][] = [];
          return {
            eq(c1: string, v1: string) {
              filters.push([c1, v1]);
              return {
                eq(c2: string, v2: string) {
                  filters.push([c2, v2]);
                  calls.push({ op: "delete", table, filters });
                  if (opts.throwOn === "delete") return Promise.reject(new Error("network"));
                  return Promise.resolve({ error: opts.deleteError ?? null });
                },
              };
            },
          };
        },
        select() {
          const filters: [string, string][] = [];
          return {
            eq(c1: string, v1: string) {
              filters.push([c1, v1]);
              return {
                eq(c2: string, v2: string) {
                  filters.push([c2, v2]);
                  return {
                    maybeSingle() {
                      calls.push({ op: "select", table, filters });
                      if (opts.throwOn === "select") return Promise.reject(new Error("network"));
                      return Promise.resolve({ data: opts.selectRow ?? null, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

describe("which table", () => {
  it("writes a post rehype to reposts, keyed by post_id", async () => {
    const { db, calls } = fakeDb();
    await setRehype(db, "me", "post", "p1", true);
    expect(calls).toEqual([{ op: "insert", table: "reposts", row: { user_id: "me", post_id: "p1" } }]);
  });

  it("writes a Shot rehype to shot_reposts, keyed by shot_id", async () => {
    const { db, calls } = fakeDb();
    await setRehype(db, "me", "shot", "s1", true);
    expect(calls).toEqual([{ op: "insert", table: "shot_reposts", row: { user_id: "me", shot_id: "s1" } }]);
  });

  it("undoes from the right table, for this user and this thing only", async () => {
    const { db, calls } = fakeDb();
    await setRehype(db, "me", "shot", "s1", false);
    expect(calls).toEqual([{ op: "delete", table: "shot_reposts", filters: [["user_id", "me"], ["shot_id", "s1"]] }]);
  });

  it("asks the right table whether it is rehyped", async () => {
    const { db, calls } = fakeDb({ selectRow: { id: "x" } });
    expect(await isRehyped(db, "me", "post", "p1")).toBe(true);
    expect(calls[0]).toEqual({ op: "select", table: "reposts", filters: [["user_id", "me"], ["post_id", "p1"]] });
  });
});

describe("setRehype outcomes", () => {
  it("reports on and off", async () => {
    expect(await setRehype(fakeDb().db, "me", "post", "p1", true)).toEqual({ ok: true, rehyped: true });
    expect(await setRehype(fakeDb().db, "me", "post", "p1", false)).toEqual({ ok: true, rehyped: false });
  });

  it("treats rehyping something already rehyped as success — a double tap, or a second tab", async () => {
    const byCode = fakeDb({ insertError: { message: "whatever", code: "23505" } });
    expect(await setRehype(byCode.db, "me", "post", "p1", true)).toEqual({ ok: true, rehyped: true });
    const byText = fakeDb({ insertError: { message: 'duplicate key value violates unique constraint "reposts_user_id_post_id_key"' } });
    expect(await setRehype(byText.db, "me", "post", "p1", true)).toEqual({ ok: true, rehyped: true });
  });

  it("says not-allowed when the database refuses — a private account's post", async () => {
    // Worth telling apart from a network blip: retrying will never work.
    const rls = fakeDb({ insertError: { message: 'new row violates row-level security policy for table "reposts"', code: "42501" } });
    expect(await setRehype(rls.db, "me", "post", "p1", true)).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("says failed for anything else, and never throws", async () => {
    const other = fakeDb({ insertError: { message: "timeout", code: "57014" } });
    expect(await setRehype(other.db, "me", "post", "p1", true)).toEqual({ ok: false, reason: "failed" });
    expect(await setRehype(fakeDb({ deleteError: { message: "boom" } }).db, "me", "post", "p1", false)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(await setRehype(fakeDb({ throwOn: "insert" }).db, "me", "shot", "s1", true)).toEqual({ ok: false, reason: "failed" });
    expect(await setRehype(fakeDb({ throwOn: "delete" }).db, "me", "shot", "s1", false)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("isRehyped", () => {
  it("is false when there is no row, and false rather than throwing on failure", async () => {
    expect(await isRehyped(fakeDb().db, "me", "shot", "s1")).toBe(false);
    expect(await isRehyped(fakeDb({ throwOn: "select" }).db, "me", "shot", "s1")).toBe(false);
  });
});

describe("rehypedBy", () => {
  it("names who rehyped it", () => {
    expect(rehypedBy("Aman")).toBe("Aman rehyped");
  });

  it("still says something for an account with no name", () => {
    expect(rehypedBy("")).toBe("Someone rehyped");
    expect(rehypedBy("   ")).toBe("Someone rehyped");
    expect(rehypedBy(null)).toBe("Someone rehyped");
    expect(rehypedBy(undefined)).toBe("Someone rehyped");
  });
});
