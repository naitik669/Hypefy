/**
 * Count the Supabase reads that throw their error away.
 *
 * `const { data } = await supabase...` makes a refused query and an empty
 * table the same value. It cost the phone four days of blank feed in
 * November (#83) and the website twelve days of a dead Shots reel (#98).
 * Both looked exactly like "there is nothing here".
 *
 * There are too many to convert in one change, so this counts them per file
 * and tests/query-errors.test.ts refuses growth — the same two-direction
 * ratchet the lint debt uses. Pay a file off and the baseline must come
 * down with it.
 *
 * The count is deliberately a little generous: it counts every `{ data }`
 * destructure in a file that talks to Supabase, which can include one that
 * is not a query result. That is fine for a ratchet — the number only has
 * to be stable and to fall, never to be a perfect census — and erring high
 * means a genuinely discarded error is never missed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const BASELINE = ".query-debt.json";

const strip = (s) =>
  s.replace(/[/][*][\s\S]*?[*][/]/g, "").replace(/(^|[^:])[/][/].*$/gm, "$1");

/** @returns {Record<string, number>} a count of discarded reads per file */
export function countDebt() {
  const files = execFileSync("git", ["ls-files", "src", "packages", "apps"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /[.](ts|tsx)$/.test(f));
  /** @type {Record<string, number>} */
  const per = {};
  for (const f of files) {
    let s;
    try {
      s = strip(readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    if (!/supabase/i.test(s)) continue;
    const n = [...s.matchAll(/\{\s*data\s*(?::\s*[A-Za-z0-9_]+)?\s*\}/g)].length;
    if (n > 0) per[f] = n;
  }
  return per;
}

if (process.argv[2] === "--update") {
  const per = countDebt();
  writeFileSync(BASELINE, JSON.stringify(per, null, 2) + "\n");
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  console.log(`query debt baseline written: ${total} reads across ${Object.keys(per).length} files`);
}
