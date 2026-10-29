import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { publishShow, publishFailureMessage } from "@/lib/show-publish";

/**
 * Publishing a Show is INSERT ... RETURNING, so the new row must pass the
 * SELECT policy as well as the INSERT one. 0183 made that policy a lookup by
 * id (can_see_show), which cannot see a row inside the statement inserting
 * it, and every Show was refused as a row-level security violation.
 */
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("the shows read policy", () => {
  it("its latest word lets the author see their own row first", () => {
    const dir = "supabase/migrations";
    const last = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && read(`${dir}/${f}`).includes('alter policy "shows_select_public"'))
      .sort()
      .pop()!;
    const sql = read(`${dir}/${last}`);
    const stmt = sql.slice(sql.lastIndexOf('alter policy "shows_select_public"'));
    expect(stmt).toContain("using ((select auth.uid()) = user_id or public.can_see_show(id));");
  });
});

/** A Supabase client that records what was asked of it. */
function fakeClient({ upload = null, insert = null, hide = null }: { upload?: unknown; insert?: unknown; hide?: unknown } = {}) {
  const calls: string[] = [];
  const removed: string[][] = [];
  const bucket = {
    upload: vi.fn(async (path: string) => (calls.push(`upload ${path}`), { error: upload })),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
    remove: vi.fn(async (paths: string[]) => (removed.push(paths), calls.push("remove"), { error: null })),
  };
  const inserted: Record<string, unknown>[] = [];
  const client = {
    storage: { from: () => bucket },
    from: (table: string) => ({
      insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
        calls.push(`insert ${table}`);
        if (table === "shows") inserted.push(row as Record<string, unknown>);
        if (table === "show_hidden_from") return Promise.resolve({ error: hide });
        return {
          select: () => ({
            single: async () => (insert ? { data: null, error: insert } : { data: { id: "show-1" }, error: null }),
          }),
        };
      },
      delete: () => ({ eq: async () => (calls.push(`delete ${table}`), { error: null }) }),
    }),
  };
  return { client: client as never, calls, removed, inserted };
}

const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
const draft = {
  userId: "u1",
  file: photo,
  caption: "  hi @sam  ",
  track: null,
  layers: [],
  audience: "everyone" as const,
  hiddenFrom: [],
};

describe("publishShow", () => {
  it("uploads into the author's folder, then writes the row with the caption's mentions", async () => {
    const f = fakeClient();
    const r = await publishShow(f.client, draft);
    expect(r).toEqual({ ok: true, id: "show-1" });
    expect(f.calls[0]).toMatch(/^upload u1\/\d+\.jpg$/);
    expect(f.inserted[0]).toMatchObject({ user_id: "u1", caption: "hi @sam", mentions: ["sam"], audience: "everyone" });
  });

  it("gives each Show of an album its own file", async () => {
    const f = fakeClient();
    await publishShow(f.client, draft, 3);
    expect(f.calls[0]).toMatch(/^upload u1\/\d+-3\.jpg$/);
  });

  it("a refused row takes its upload back down", async () => {
    const f = fakeClient({ insert: { code: "42501" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await publishShow(f.client, draft);
    expect(r).toEqual({ ok: false, reason: "insert" });
    expect(f.removed).toHaveLength(1);
  });

  it("a failed upload writes nothing", async () => {
    const f = fakeClient({ upload: { message: "413" } });
    const r = await publishShow(f.client, draft);
    expect(r).toEqual({ ok: false, reason: "upload" });
    expect(f.calls.some((c) => c.startsWith("insert"))).toBe(false);
  });

  it("if who it is hidden from cannot be written, the Show comes back down with its file", async () => {
    const f = fakeClient({ hide: { message: "nope" } });
    const r = await publishShow(f.client, { ...draft, hiddenFrom: ["u2"] });
    expect(r).toEqual({ ok: false, reason: "hidden" });
    expect(f.calls).toContain("delete shows");
    expect(f.removed).toHaveLength(1);
  });

  it("says what went wrong in words", () => {
    expect(publishFailureMessage("upload")).toContain("connection");
    expect(publishFailureMessage("hidden")).toContain("Nothing was posted");
  });

  it("the single-Show preview publishes through it", () => {
    const src = read("src/components/create/ShotPreview.tsx");
    expect(src).toContain("const result = await publishShow(supabase, {");
    expect(src).not.toContain('from("shows").insert');
  });
});
