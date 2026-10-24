import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Every foreign key has an index behind it.
 *
 * 0145 added ten of these and set the standard. 0157 and 0162 then introduced
 * six new references to `profiles` without covering any of them — the rule
 * existed and the new tables did not follow it, and nothing noticed until the
 * performance advisor was re-read a day later.
 *
 * All six are ON DELETE SET NULL against profiles, which is exactly where the
 * index earns its keep: deleting an account has to find the referencing rows
 * in each table to null them, and without an index that is a sequential scan
 * per table per deletion. That path has already had to be repaired once
 * (0147), and media_fingerprints is the fastest-growing table in the schema —
 * one row per uploaded image, forever.
 *
 * Verified live after applying: zero unindexed foreign keys in the whole
 * public schema, and an account deletion that nulls the new columns while
 * leaving the blocklist hash behind — a takedown has to outlive the
 * moderator's account.
 *
 * This reads the migrations rather than the database, so it runs in CI: it
 * finds every `references public.<t>(...)` a migration declares and insists a
 * matching index exists somewhere in the same folder.
 */

const DIR = "supabase/migrations";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** A migration's executable SQL: comment lines stripped out.
 *
 *  Not cosmetic. A restore during a mutation sweep once spliced a `create
 *  index` onto the end of a `--` line, which left the file looking right to
 *  a substring search and silently dead to Postgres — a fresh deploy would
 *  have skipped that index entirely. A test that cannot tell code from
 *  prose is not checking the thing it claims to check. */
const executable = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

const sql = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => executable(read(`${DIR}/${f}`)))
  .join("\n");

describe("the tables added for moderation", () => {
  // Column-level `references` written by 0157 and 0162. Checked by name
  // rather than parsed out of the whole schema, because the point is these
  // six specifically — the ones that were missed.
  const expected: Array<[string, string, string]> = [
    ["blocked_media", "added_by", "blocked_media_added_by_idx"],
    ["media_fingerprints", "user_id", "media_fingerprints_user_idx"],
    ["reports", "acknowledged_by", "reports_acknowledged_by_idx"],
    ["reports", "resolved_by", "reports_resolved_by_idx"],
    ["message_reports", "acknowledged_by", "message_reports_acknowledged_by_idx"],
    ["message_reports", "resolved_by", "message_reports_resolved_by_idx"],
  ];

  for (const [table, column, index] of expected) {
    it(`${table}.${column} has a covering index`, () => {
      expect(sql).toContain(`create index if not exists ${index}`);
      expect(sql).toContain(`on public.${table} (${column})`);
    });
  }

  it("all six were added together, in one migration", () => {
    const m = executable(read(`${DIR}/0164_media_report_fk_indexes.sql`));
    expect(m.match(/create index if not exists/g)).toHaveLength(6);
  });

  it("and none of them is hiding inside a comment", () => {
    // The whole file, including prose, must not contain more CREATE INDEXes
    // than the executable part does. A statement spliced onto a -- line
    // reads fine and does nothing.
    const whole = read(`${DIR}/0164_media_report_fk_indexes.sql`);
    const inCode = executable(whole).match(/create index/gi)?.length ?? 0;
    const anywhere = whole.match(/create index/gi)?.length ?? 0;
    expect(inCode).toBe(anywhere);
  });
});

describe("the reason they matter is written down", () => {
  it("names the deletion path, not just the advisor", () => {
    // An index added because a linter asked gets removed by the next person
    // who reads the linter differently.
    const m = read(`${DIR}/0164_media_report_fk_indexes.sql`);
    expect(m).toContain("ON DELETE SET NULL");
    expect(m).toContain("sequential scan");
  });
});
