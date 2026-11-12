import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { isOpenPath } from "@/lib/invite-gate";

/**
 * A scheduled job must get past the invite wall.
 *
 * pg_cron calls these through pg_net, which carries no cookies, so a gated
 * cron endpoint answers 401 `invite_required` and the job stops working. It
 * does not stop *reporting* working: the function queues the request and
 * returns long before pg_net learns the answer, so pg_cron files the run as
 * "succeeded" either way. That is the third time this exact shape has cost
 * weeks — the Shows reaper's eleven nightly 404s (0192) and the media
 * verifier's 5,083 silent no-ops (0193) were both filed as successes.
 *
 * So this does not take a hand-written list. It reads the URLs out of the
 * migrations that actually schedule the work, which means a fifth endpoint
 * cannot be added without either being exempt or failing here.
 */

const MIGRATIONS = "supabase/migrations";

/** Every app API path any migration posts to, whichever host it names. */
function cronPaths(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
    // Either host: 0181 pointed the reaper at www and 0192 moved it to app,
    // and the path is what the gate decides on, not the host.
    for (const m of sql.matchAll(/https:\/\/(?:app|www)\.hypefy\.chat(\/api\/[a-z0-9/_-]+)/g)) {
      found.add(m[1]);
    }
  }
  return [...found].sort();
}

describe("the endpoints pg_cron posts to", () => {
  it("are found in the migrations at all, so this test cannot pass by finding nothing", () => {
    const paths = cronPaths();
    expect(paths.length).toBeGreaterThanOrEqual(4);
    // The four that exist today, named so that a disappearing one is a
    // failure rather than a quietly shorter list.
    expect(paths).toContain("/api/push");
    expect(paths).toContain("/api/oneshot/reap");
    expect(paths).toContain("/api/shows/reap");
    expect(paths).toContain("/api/moderation/verify");
  });

  it("every one of them answers before the invite wall does", () => {
    const gated = cronPaths().filter((p) => !isOpenPath(p));
    expect(gated, `gated cron endpoints: ${gated.join(", ")}`).toEqual([]);
  });

  it("and the wall still stands everywhere it should", () => {
    // The exemptions are specific paths, not a blanket pass for /api/.
    for (const p of ["/api/moderation", "/api/shows", "/api/shows/reap/x", "/api/push/all", "/feed", "/settings"]) {
      expect(isOpenPath(p), p).toBe(false);
    }
  });
});
