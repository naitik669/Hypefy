import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * One policy per table per command.
 *
 * Permissive policies for the same role and command are OR'd, and Postgres
 * evaluates every one of them against every candidate row. Six tables had
 * two apiece. The advisor reports that thirty times because it counts once
 * per role, which made it look five times larger than it was.
 *
 * Four were a plain OR-merge. Two were a different shape — an `ALL` policy
 * silently acting as a second `SELECT` policy — and the fix there is to
 * narrow the `ALL` to the writes it exists for.
 *
 * Equivalence was established before applying, two ways: every (user, row)
 * pair in all six tables, 18,101 of them, evaluated under the old pair of
 * expressions and the new single one with zero differences; and then the
 * real policies swapped inside a transaction with visible-row counts taken
 * as real users before and after, all twelve identical.
 *
 * This file guards the shape, since the behaviour is already proven.
 */

const sql = readFileSync("supabase/migrations/0165_merge_permissive_policies.sql", "utf8").replace(/\r\n/g, "\n");

describe("the four plain merges keep both halves", () => {
  it("reports: admin OR the person who filed it", () => {
    // Losing either half is a silent permission change: drop the admin half
    // and the queue empties; drop the other and nobody sees their own report.
    expect(sql).toContain(
      `create policy "reports: admin or own read" on public.reports\n  for select using (is_admin() or reporter_id = (select auth.uid()));`,
    );
  });

  it("message_reports: the same shape", () => {
    expect(sql).toContain(
      `create policy "message_reports: admin or own read" on public.message_reports\n  for select using (is_admin() or reporter_id = (select auth.uid()));`,
    );
  });

  it("note_hypes: the hyper and the note's owner", () => {
    const p = sql.slice(sql.indexOf("create policy note_hypes_select"));
    expect(p.slice(0, 220)).toContain("= hyper_id or (select auth.uid()) = note_owner_id");
  });

  it("notifications: the recipient always, the actor only for a follow", () => {
    // The `and type = 'follow'` is the whole point of the actor branch.
    // Without it an actor could delete any notification naming them.
    const p = sql.slice(sql.indexOf('create policy "notifications: recipient or follow actor delete"'));
    expect(p.slice(0, 300)).toContain("(select auth.uid()) = user_id");
    expect(p.slice(0, 300)).toContain("(select auth.uid()) = actor_id and type = 'follow'");
  });
});

describe("the two ALL policies are narrowed, not deleted", () => {
  it("note_reactions keeps all three writes for the reactor", () => {
    // Dropping FOR ALL without replacing it would leave reactors unable to
    // react at all. Each command needs its own policy.
    for (const cmd of ["insert", "update", "delete"]) {
      expect(sql, cmd).toContain(`create policy note_reactions_reactor_${cmd} on public.note_reactions`);
    }
    expect(sql).toContain("create policy note_reactions_select on public.note_reactions");
  });

  it("and update carries both USING and WITH CHECK", () => {
    // USING alone would let a reactor move a row to somebody else.
    const p = sql.slice(sql.indexOf("create policy note_reactions_reactor_update"));
    expect(p.slice(0, 260)).toContain("using ((select auth.uid()) = reactor_id)");
    expect(p.slice(0, 260)).toContain("with check ((select auth.uid()) = reactor_id)");
  });

  it("showcase_items keeps all three writes for the board's owner", () => {
    for (const cmd of ["insert", "update", "delete"]) {
      expect(sql, cmd).toContain(`create policy "showcase items: owner ${cmd}" on public.showcase_items`);
    }
  });

  it("and its update carries both too", () => {
    const p = sql.slice(sql.indexOf('create policy "showcase items: owner update"'));
    const body = p.slice(0, 500);
    expect(body).toContain("for update using (");
    expect(body).toContain("with check (");
  });

  it("the reader policy for showcase_items is left alone", () => {
    // "follow the board" already admits the owner, which is why the ALL
    // policy could stop covering SELECT. Touching it was never part of this.
    //
    // Checked against the statements, not the file: the comment explaining
    // that reasoning names the policy, and an assertion the prose can
    // satisfy is one the code can break without failing.
    const statements = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toContain("follow the board");
  });
});

describe("the reasoning is recorded, not just the result", () => {
  it("says how equivalence was established", () => {
    expect(sql).toContain("18,101");
  });

  it("and names the one thing the data could not prove", () => {
    // Every account is public, so no amount of data would have shown that
    // an owner stays visible to themselves. can_see_profile's first clause
    // is what makes it true.
    expect(sql).toContain("can_see_profile");
    expect(sql).toContain("p_user = (select auth.uid())");
  });
});
