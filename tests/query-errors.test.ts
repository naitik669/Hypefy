import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { countDebt, BASELINE } from "../scripts/query-debt.mjs";

/**
 * A read that throws its error away cannot be told from an empty table.
 *
 * `const { data } = await supabase...` discards the error. When PostgREST
 * refuses the query — a wrong column, an ambiguous embed, a policy — `data`
 * is null, and the screen renders whatever it renders for "nothing here".
 *
 * That has now cost two outages. The phone, November: four days of blank
 * feed, because the loaders asked for `media_url` on a table with
 * `image_url`. The website, 14 to 26 November: twelve days of "The reel is
 * empty" with nine Shots in the database, because a new table made an embed
 * ambiguous. Neither client said a word; both logged success.
 *
 * There were 288 of these when this file was written, so they cannot all be
 * converted at once. This is a ratchet, like the lint debt: the baseline is
 * committed, growth fails, and paying one off fails too until the baseline
 * comes down with it. Both directions matter — a baseline nobody lowers
 * stops describing the code and starts excusing it.
 *
 * The way out of a failure is `must` or `tolerate` from @hypefy/core/query:
 * `must` throws, and the route error boundary turns that into "That didn't
 * load" with a retry; `tolerate` returns the same value it always did but
 * writes the database's message to the server log, for the reads a page can
 * genuinely do without.
 */

describe("a refused query is never mistaken for an empty one", () => {
  const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE, "utf8"));
  const now = countDebt();

  it("takes on no new discarded errors", () => {
    const worse = Object.entries(now)
      .filter(([file, n]) => n > (baseline[file] ?? 0))
      .map(([file, n]) => `${file}: ${baseline[file] ?? 0} -> ${n}`);
    expect(
      worse,
      "new reads discard their error — use must() or tolerate() from @hypefy/core/query",
    ).toEqual([]);
  });

  it("keeps the baseline honest when debt is paid off", () => {
    const better = Object.entries(baseline)
      .filter(([file, n]) => (now[file] ?? 0) < n)
      .map(([file, n]) => `${file}: ${n} -> ${now[file] ?? 0}`);
    expect(
      better,
      "these files improved — run `node scripts/query-debt.mjs --update` so the baseline cannot drift back",
    ).toEqual([]);
  });

  it("the two feeds stay paid off", () => {
    /*
     * Named, not merely left out of the baseline. These are the pages the
     * outage was actually on, they are the first thing every signed-in
     * person loads, and "it is not in the baseline" is a weaker statement
     * than "it is forbidden here".
     */
    for (const page of ["src/app/(app)/home/page.tsx", "src/app/(app)/shots/page.tsx"]) {
      expect(now[page] ?? 0, `${page} went back to discarding read errors`).toBe(0);
    }
  });
});
