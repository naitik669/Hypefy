import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Being able to prove the commitment on /grievance.
 *
 * That page publishes the IT Rules timeframes — acknowledge within 24 hours,
 * dispose within fifteen days — and the queue could measure neither. A
 * published commitment nobody can evidence is worse than no commitment: it
 * is the one a regulator asks about first.
 *
 * The behaviour was verified against the live database inside a rolled-back
 * transaction, all nine steps. What this pins is the handful of things that
 * would quietly make the numbers lie.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0162_report_sla.sql");
const queue = read("src/components/admin/ReportsQueue.tsx");
const page = read("src/app/(app)/admin/reports/page.tsx");

describe("the numbers cannot drift from the published page", () => {
  it("measures the two timeframes /grievance actually commits to", () => {
    const grievance = read("src/app/(legal)/grievance/page.tsx");
    expect(grievance).toContain("Acknowledged within 24 hours");
    expect(grievance).toContain("Resolved within 15 days");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("interval '15 days'");
  });

  it("counts both report tables, because a complainant does not care which", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.report_sla"));
    expect(fn).toContain("from public.reports where status = 'open'");
    expect(fn).toContain("from public.message_reports where status = 'open'");
    expect(fn).toContain("union all");
  });
});

describe("reopening does not leave a stale resolution", () => {
  it("clears resolved_at and resolved_by", () => {
    // This is the one that would make the numbers say the opposite of the
    // truth: a reopened report still carrying a resolved_at reads as
    // disposed of when nobody has disposed of it.
    const fn = sql.slice(sql.indexOf("create or replace function public.admin_resolve_report"));
    expect(fn).toContain("set status = $1, resolved_at = null, resolved_by = null");
  });

  it("but keeps the acknowledgement, which did happen", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.admin_resolve_report"));
    const reopen = fn.slice(fn.indexOf("if p_status = 'open' then"), fn.indexOf("else"));
    expect(reopen).not.toContain("acknowledged_at = null");
  });
});

describe("an acknowledgement time that moves is not a measurement", () => {
  it("the first one wins and a second click changes nothing", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.admin_acknowledge_report"));
    expect(fn).toContain("where id = $2 and acknowledged_at is null");
  });

  it("resolving also acknowledges, if nobody had", () => {
    // You cannot dispose of something without having had it in hand, and
    // leaving the column null would overstate the breach count.
    expect(sql).toContain("acknowledged_at = coalesce(acknowledged_at, now())");
  });
});

describe("only an admin can move either clock", () => {
  it("both functions check first", () => {
    for (const fn of ["admin_acknowledge_report", "admin_resolve_report"]) {
      const body = sql.slice(sql.indexOf(`create or replace function public.${fn}`));
      expect(body.slice(0, 700), fn).toContain("if not public.is_admin() then");
    }
  });

  it("and neither accepts a table name it does not know", () => {
    // Both build SQL with format(%I), so an unchecked name would be the
    // injection point.
    expect(sql.match(/p_table not in \('reports', 'message_reports'\)/g)?.length).toBe(2);
  });

  it("the summary is not readable by anon", () => {
    expect(sql).toContain("revoke all on function public.report_sla() from public, anon;");
  });
});

describe("the numbers are put in front of whoever opens the queue", () => {
  it("the page asks for them", () => {
    expect(page).toContain('supabase.rpc("report_sla")');
    expect(page).toContain("<ReportsQueue rows={rows} sla=");
  });

  it("the banner shows only when something is actually past due", () => {
    // A banner that is always there is furniture, and stops being read.
    expect(queue).toContain(
      "if (!sla || (sla.unacknowledged_over_24h === 0 && sla.open_over_15_days === 0)) return null;",
    );
  });

  it("and there is a way to acknowledge without deciding the report", () => {
    expect(queue).toContain("admin_acknowledge_report");
    expect(queue).toContain("Acknowledge");
    // Gone once it has been taken in hand.
    expect(queue).toContain("{isOpen && !ackedById.get(r.id) && (");
  });
});

describe("nothing was backfilled", () => {
  it("no invented resolution times", () => {
    // Every report is open and nothing has ever been resolved, so there is
    // no history to recover — and inventing a resolved_at would fabricate
    // the exact evidence this exists to provide.
    expect(sql).not.toMatch(/update public\.(reports|message_reports)\s+set resolved_at/);
    expect(sql).toContain("No backfill");
  });
});
