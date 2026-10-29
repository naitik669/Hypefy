import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The half of readiness that is state rather than configuration.
 *
 * /api/readiness could already answer "is a key present". Everything that
 * actually went wrong in the week before launch was the other question:
 * eight reports open for up to 142 days, six realtime subscriptions
 * receiving nothing for the life of the app, a verification job that sits
 * inert forever if half its secret is never created.
 *
 * None of those is a missing environment variable. All of them were
 * invisible. The behaviour here was verified live — 10 of 10 cron jobs
 * active, the Vault secret correctly reported absent, a non-admin refused
 * with 42501, and a job that was never created named as missing rather than
 * quietly uncounted.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0163_ops_readiness.sql");
const route = read("src/app/api/readiness/route.ts");

describe("it reports state the environment cannot see", () => {
  it("cron jobs, both halves of the moderation secret, and the queue", () => {
    expect(route).toContain('supabase.rpc("ops_readiness")');
    expect(route).toContain('supabase.rpc("report_sla")');
    for (const k of ["cron", "media_verification", "report_queue"]) {
      expect(route, k).toContain(`${k}: {`);
    }
  });

  it("names expected jobs rather than counting what exists", () => {
    // Counting what exists can only tell you about what exists. A job that
    // was never created has to be as visible as one switched off.
    expect(sql).toContain("expected text[] := array[");
    expect(sql).toContain("'verify-media-hashes'");
  });

  it("and every cron job this repo creates is in that list", () => {
    // Otherwise the check reports all-clear while a job nobody added sits
    // missing. 0167 exists because 0166 added an eleventh job and the list
    // did not grow with it — the same mistake, one migration apart.
    // Taken from every cron.schedule() in the migrations, which is where a
    // job actually comes into being — not from a doc that can fall behind.
    //
    // Which migration holds the list is found rather than named. It used
    // to be spelled out here, so adding a job meant remembering to move a
    // pointer in a test — the same shape of mistake the test is for, and
    // it duly caught the twelfth job by failing on a stale filename.
    const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
    const defining = files.filter((f) =>
      read(`supabase/migrations/${f}`).includes("function public.ops_readiness"),
    );
    expect(defining.length, "no migration defines ops_readiness").toBeGreaterThan(0);
    const latest = read(`supabase/migrations/${defining[defining.length - 1]}`);
    const all = files.map((f) => read(`supabase/migrations/${f}`)).join("\n");
    const jobs = [...new Set([...all.matchAll(/cron\.schedule\(\s*'([a-z-]+)'/g)].map((m) => m[1]))];
    expect(jobs.length).toBeGreaterThan(8);
    for (const job of jobs) expect(latest, job).toContain(`'${job}'`);
    expect(sql).toContain("where not exists (");
  });

  it("checks the env secret and the Vault secret separately", () => {
    // Neither can see the other: the variable is the route's, the Vault row
    // is what pg_cron reads. One without the other means the job never runs.
    expect(route).toContain("env_secret: has(env.MODERATION_VERIFY_SECRET)");
    expect(route).toContain("vault_secret: ops?.moderation_secret_set");
    expect(route).toContain(
      "ok: has(env.MODERATION_VERIFY_SECRET) && ops?.moderation_secret_set === true",
    );
  });
});

describe("no secret value ever leaves", () => {
  it("the function answers whether a row exists, not what is in it", () => {
    expect(sql).toContain("exists (select 1 from vault.decrypted_secrets where name = 'moderation_verify_secret')");
    expect(sql).not.toContain("decrypted_secret,");
    expect(sql).not.toMatch(/select\s+decrypted_secret\s+(?!.*exists)/);
  });

  it("and the route reports booleans and counts", () => {
    const ops = route.slice(route.indexOf("const operations = {"), route.indexOf("const missing"));
    expect(ops).not.toMatch(/process\.env\.\w*SECRET\b(?!\))/);
  });
});

describe("only an admin may ask", () => {
  it("the function refuses anyone else", () => {
    // Verified live: a non-admin gets 42501, not a row of zeros.
    expect(sql).toContain("if not public.is_admin() then");
    expect(sql).toContain("raise exception 'Not authorised' using errcode = '42501';");
  });

  it("and anon cannot execute it at all", () => {
    expect(sql).toContain("revoke all on function public.ops_readiness() from public, anon;");
  });

  it("the route was already admin-gated and stays so", () => {
    expect(route).toContain('if (isAdmin !== true) return NextResponse.json({ error: "not allowed" }, { status: 403 });');
  });
});

describe("the two verdicts stay apart", () => {
  it("operations has its own ok, not folded into the deployment's", () => {
    // A stale report queue is not a deployment failure, and reading as one
    // would make `ok` useless for the question it answers.
    expect(route).toContain("operationsOk: Object.values(operations).every((o) => o.ok)");
    // The expression itself, not the lines after it — `operations` is
    // rendered in the same object literal, two lines below.
    // From the response onward: `operations` has its own `ok:` lines above.
    const body = route.slice(route.lastIndexOf("return NextResponse.json("));
    const okLine = body.split("\n").find((l) => l.trim().startsWith("ok:"));
    expect(okLine?.trim()).toBe("ok: missing.length === 0,");
  });

  it("the report queue is judged against what /grievance publishes", () => {
    expect(route).toContain("unacknowledged_over_24h === 0 && sla.open_over_15_days === 0");
  });
});

describe("what still cannot be seen is named", () => {
  it("rather than quietly left out", () => {
    for (const item of [
      "Supabase custom SMTP",
      "Supabase leaked-password protection",
      "Supabase plan and point-in-time recovery",
    ]) {
      expect(route, item).toContain(item);
    }
  });
});
