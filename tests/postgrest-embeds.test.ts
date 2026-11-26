import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Every embedded select names the relationship it travels.
 *
 * PostgREST resolves `shots(..., profiles(...))` by looking for a way to join
 * the two tables. While there is exactly one, the bare name works. The moment
 * a SECOND way exists it refuses the whole query with PGRST201 — and the
 * second way can be created by a table that neither query nor feature has
 * ever heard of.
 *
 * That is not hypothetical. Migration 0202 added `shot_watch_stats`, a table
 * with two foreign keys, one to `shots` and one to `profiles`. It made every
 * `shots -> profiles` embed in the codebase ambiguous, and PostgREST began
 * refusing eight queries in files the migration did not touch: the Shots
 * reel, a single Shot, the home feed's Shots, Shots quoted in DMs, the
 * rehypes grid and the sound page. Shots had not loaded since 14 November.
 *
 * It was silent for twelve days because every one of those call sites wrote
 * `const { data } = await supabase...`, discarding the error, so a refused
 * query and an empty table are the same thing on screen. The reel said "The
 * reel is empty" with nine Shots in the database.
 *
 * Naming the constraint cannot go stale the way the bare form can: a new
 * table never makes `profiles!shots_user_id_fkey` ambiguous, and if the
 * constraint is ever renamed PostgREST says so loudly (PGRST200) instead of
 * returning nothing.
 *
 * The rule below is deliberately STRICTER than PostgREST: it counts
 * `saved_shots` as a path where the live server does not, because the server
 * also weighs the join table's primary key and the generated types do not
 * carry one. Erring strict is the safe direction — it can demand a name that
 * was not yet required, never miss one that is. Today it demands none: the
 * codebase passes with no exemptions.
 */

type Fk = { owner: string; fk: string; target: string | null };

/** Every foreign key in the schema, read from the generated types. */
function foreignKeys(): Map<string, Fk[]> {
  const src = readFileSync("packages/core/src/supabase/database.types.ts", "utf8");
  const all: Fk[] = [];
  let owner: string | null = null;
  for (const line of src.split("\n")) {
    const t = line.match(/^      ([a-z_0-9]+): \{$/);
    if (t) owner = t[1];
    const f = line.match(/foreignKeyName: "([^"]+)"/);
    if (f) all.push({ owner: owner as string, fk: f[1], target: null });
    const r = line.match(/referencedRelation: "([^"]+)"/);
    if (r && all.length && all[all.length - 1].target === null) all[all.length - 1].target = r[1];
  }
  const byOwner = new Map<string, Fk[]>();
  for (const f of all) {
    if (!byOwner.has(f.owner)) byOwner.set(f.owner, []);
    (byOwner.get(f.owner) as Fk[]).push(f);
  }
  return byOwner;
}

/** The ways PostgREST could join parent to child. More than one is a refusal. */
function joinPaths(byOwner: Map<string, Fk[]>, parent: string, child: string): string[] {
  const out: string[] = [];
  for (const f of byOwner.get(parent) ?? []) if (f.target === child) out.push("direct:" + f.fk);
  for (const f of byOwner.get(child) ?? []) if (f.target === parent) out.push("direct:" + f.fk);
  for (const [join, list] of byOwner) {
    if (join === parent || join === child || list.length !== 2) continue;
    const touchesBoth =
      list.some((f) => f.target === parent) && list.some((f) => f.target === child);
    if (touchesBoth) out.push("via:" + join);
  }
  return out;
}

const stripComments = (s: string) =>
  s.replace(/[/][*][\s\S]*?[*][/]/g, "").replace(/(^|[^:])[/][/].*$/gm, "$1");

type Embed = { file: string; parent: string; child: string; named: boolean };

/**
 * Every embed written in the codebase, with the table it hangs off.
 *
 * The select argument CONTAINS parentheses — that is what an embed is — so it
 * is matched as a whole quoted string. The first version of this scan read
 * "up to the first )", which truncated every embedded select and found two of
 * the eight broken call sites while reporting that it had checked them all.
 */
function embeds(): Embed[] {
  const files = execFileSync("git", ["ls-files", "src", "apps", "packages"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /[.](ts|tsx)$/.test(f));
  const out: Embed[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = stripComments(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const consts = new Map<string, string>();
    for (const m of src.matchAll(/const\s+(\w+)\s*(?::\s*string)?\s*=\s*\n?\s*"([^"]*)"/g)) {
      consts.set(m[1], m[2]);
    }
    const calls = src.matchAll(
      /[.]from\(\s*"([a-z_0-9]+)"\s*\)([\s\S]{0,400}?)[.]select\(\s*(?:"([^"]*)"|(\w+))/g,
    );
    for (const m of calls) {
      const sel = m[3] !== undefined ? m[3] : consts.get(m[4]);
      if (!sel) continue;
      // Nesting is tracked so `shots(... profiles(...))` is checked against
      // shots, not against the table the query started from.
      const stack = [m[1]];
      let name = "";
      for (const c of sel) {
        if (/[\w!:*]/.test(c)) {
          name += c;
          continue;
        }
        if (c === "(") {
          const label = name.split(":").pop() as string;
          const child = label.split("!")[0];
          if (child) {
            out.push({ file, parent: stack[stack.length - 1], child, named: label.includes("!") });
          }
          stack.push(child);
          name = "";
          continue;
        }
        if (c === ")") stack.pop();
        name = "";
      }
    }
  }
  return out;
}

describe("a select that embeds another table says which relationship it means", () => {
  it("reads the schema it is checking against", () => {
    const byOwner = foreignKeys();
    expect(byOwner.size).toBeGreaterThan(50);
    // The table that caused the outage, and the proof this file would have
    // caught it: shots to profiles is reachable more than one way.
    expect(joinPaths(byOwner, "shots", "profiles").length).toBeGreaterThan(1);
  });

  it("sees an embed nested inside another embed, to the end of the select", () => {
    /*
     * Not a count: a count stays comfortably above any threshold while the
     * scan quietly reads half of each select. This names the deepest real
     * case in the codebase — profiles inside shots inside a messages select,
     * near the END of a long string — so truncating the select argument or
     * losing the nesting stack fails here rather than passing vacuously.
     */
    const found = embeds();
    const nested = found.filter(
      (e) =>
        e.file === "src/app/(app)/messages/[threadId]/page.tsx" &&
        e.parent === "shots" &&
        e.child === "profiles",
    );
    expect(nested.map((e) => e.named), "the nested shots -> profiles embed went unseen").toEqual([true]);
  });

  it("leaves no embed for PostgREST to guess at", () => {
    const byOwner = foreignKeys();
    const ambiguous = embeds()
      .filter((e) => !e.named)
      .filter((e) => joinPaths(byOwner, e.parent, e.child).length > 1)
      .map((e) => `${e.file}: ${e.parent} -> ${e.child} (${joinPaths(byOwner, e.parent, e.child).join(", ")})`);
    expect(
      [...new Set(ambiguous)],
      "PostgREST will refuse these with PGRST201 and the screen will look empty — write the child as `child!constraint_fkey(...)`",
    ).toEqual([]);
  });
});
