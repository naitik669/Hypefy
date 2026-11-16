#!/usr/bin/env node
/**
 * The lint ratchet.
 *
 * The repo has 280 eslint errors across 70 files. Making the whole-repo lint
 * blocking would turn CI red on the first run, so the gate is on CHANGED
 * files: new and edited code must be clean even though the existing debt is
 * not, and the number goes down over time rather than up.
 *
 * The first version of that gate required ZERO errors in every changed file.
 * That is not a ratchet, it is a freeze, and it blocked two legitimate
 * one-line changes: a CSS class rename could not touch RealChatView or
 * ReelsFeed without also paying 18 unrelated `no-explicit-any` and 12
 * react-hooks errors in chat and call code — which cannot be verified
 * without an account and, for the call ones, two devices. The consequence
 * was that the chat view and the Shots feed stayed 480px wide on a desktop
 * because their files were untouchable.
 *
 * So it compares against a recorded baseline instead, and it tightens in
 * both directions:
 *
 *   - MORE errors than the baseline fails. New debt is blocked, which is the
 *     whole point.
 *   - FEWER errors than the baseline also fails, asking for the baseline to
 *     be lowered. Touching a file is the moment its debt figure is in front
 *     of you, so that is when the ratchet clicks. Without this the baseline
 *     would drift upward in meaning — stale numbers that permit debt nobody
 *     has introduced yet.
 *
 * Usage:
 *   node scripts/lint-ratchet.mjs <file>...     check those files
 *   node scripts/lint-ratchet.mjs --update      rewrite the baseline wholesale
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { delimiter, join } from "node:path";

const BASELINE = ".eslint-debt.json";

/**
 * eslint's own JSON, for the given paths (or the whole repo).
 *
 * The installed binary rather than `npx`: on Windows npx is a .cmd, which
 * execFileSync cannot launch without a shell, and going through a shell
 * means quoting every path. node_modules/.bin/eslint is a JS file with a
 * shebang, so it runs under the node already here.
 */
function lint(paths) {
  const bin = join("node_modules", "eslint", "bin", "eslint.js");
  const args = [bin, ...(paths.length ? paths : ["."]), "-f", "json"];
  let out;
  try {
    out = execFileSync(process.execPath, args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PATH: `${join("node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}` },
    });
  } catch (e) {
    // eslint exits non-zero when it finds errors, which is the normal case
    // here — the report is still on stdout.
    out = e.stdout ?? "";
    if (!out.trim()) {
      // A real failure: a bad config, a path that does not exist, a crash.
      // Never report "no errors" for a lint that did not run.
      throw new Error(`eslint failed to run: ${e.stderr || e.message}`);
    }
  }
  return JSON.parse(out);
}

/** Error count per repo-relative path, zero counts omitted. */
function counts(results) {
  const root = process.cwd().split("\\").join("/") + "/";
  const out = new Map();
  for (const f of results) {
    if (!f.errorCount) continue;
    out.set(f.filePath.split("\\").join("/").replace(root, ""), f.errorCount);
  }
  return out;
}

function readBaseline() {
  if (!existsSync(BASELINE)) return new Map();
  return new Map(Object.entries(JSON.parse(readFileSync(BASELINE, "utf8"))));
}

const argv = process.argv.slice(2);

if (argv[0] === "--update") {
  const map = counts(lint([]));
  const sorted = {};
  for (const k of [...map.keys()].sort()) sorted[k] = map.get(k);
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  console.log(`${BASELINE}: ${map.size} files, ${total} errors`);
  process.exit(0);
}

const files = argv.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.log("No TypeScript changed. Nothing to check.");
  process.exit(0);
}

const baseline = readBaseline();
const actual = counts(lint(files));

const worse = [];
const better = [];

for (const f of files) {
  const path = f.split("\\").join("/");
  const was = Number(baseline.get(path) ?? 0);
  const now = Number(actual.get(path) ?? 0);
  if (now > was) worse.push({ path, was, now });
  else if (now < was) better.push({ path, was, now });
}

if (worse.length) {
  console.error("\nNew lint errors in changed files:\n");
  for (const w of worse) {
    console.error(`  ${w.path}  ${w.was} -> ${w.now}  (+${w.now - w.was})`);
  }
  console.error(
    "\nFix them. If an error is genuinely pre-existing and this file is new" +
      "\nto the baseline, run: node scripts/lint-ratchet.mjs --update" +
      "\nand say in the commit why the debt is being recorded rather than paid.\n",
  );
  process.exit(1);
}

if (better.length) {
  console.error("\nFewer lint errors than the baseline — lower it:\n");
  for (const b of better) {
    console.error(`  ${b.path}  ${b.was} -> ${b.now}  (-${b.was - b.now})`);
  }
  console.error(
    "\nRun: node scripts/lint-ratchet.mjs --update\n" +
      "and commit .eslint-debt.json. Touching a file is when the ratchet clicks.\n",
  );
  process.exit(1);
}

console.log(`Lint ratchet: ${files.length} changed file(s), no new errors.`);
