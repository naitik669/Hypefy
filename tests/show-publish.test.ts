import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Publishing a Show is INSERT ... RETURNING, so the new row must pass the
 * SELECT policy as well as the INSERT one. 0183 made that policy a lookup by
 * id (can_see_show), which cannot see a row inside the statement inserting
 * it, and every Show was refused as a row-level security violation.
 */
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("publishing a Show", () => {
  it("the latest word on the shows read policy lets the author see their own row first", () => {
    const dir = "supabase/migrations";
    const last = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && read(`${dir}/${f}`).includes('alter policy "shows_select_public"'))
      .sort()
      .pop()!;
    const sql = read(`${dir}/${last}`);
    const stmt = sql.slice(sql.lastIndexOf('alter policy "shows_select_public"'));
    expect(stmt).toContain("using ((select auth.uid()) = user_id or public.can_see_show(id));");
  });

  it("a failed publish takes its upload back down, and says what went wrong", () => {
    const src = read("src/components/create/ShotPreview.tsx");
    const fail = src.slice(src.indexOf("if (insErr || !row) {"), src.indexOf('toast("Couldn\'t publish that. Try again.");'));
    expect(fail).toContain("await supabase.storage.from(bucket).remove([path]);");
    expect(fail).toContain('console.error("show insert failed", insErr);');
  });
});
