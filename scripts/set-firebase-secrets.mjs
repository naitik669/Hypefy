#!/usr/bin/env node
/**
 * Set the Firebase secrets from the files Firebase hands you, without ever
 * hand-pasting a key.
 *
 * Four secrets have to agree with each other, and when they do not the app
 * does not break loudly — it stops sending notifications with nothing in the
 * logs to say why. The disagreements this catches:
 *
 *   - google-services.json for a package the app does not use. The Gradle
 *     plugin fails the build with "No matching client found".
 *   - A service account from a DIFFERENT Firebase project than
 *     google-services.json. The client registers tokens in one project, the
 *     server posts to projects/<other>/messages:send, and FCM rejects every
 *     send. This is the one that is invisible.
 *   - A private key whose PEM was mangled on the way through a text box. It
 *     still parses, still passes the app's own "configured" check, and fails
 *     only when something tries to sign with it.
 *
 * Usage:
 *   node scripts/set-firebase-secrets.mjs \
 *     --google-services ~/Downloads/google-services.json \
 *     --service-account ~/Downloads/hypefy-4f6bb-firebase-adminsdk.json
 *
 * Either flag may be omitted. --dry-run checks everything and sets nothing.
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";

const REPO = "naitik669/Hypefy";
/** The applicationId in android/app/build.gradle and apps/mobile/app.json. */
const PACKAGE = "chat.hypefy.app";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const dryRun = argv.includes("--dry-run");

const gsPath = flag("google-services");
const saPath = flag("service-account");

if (!gsPath && !saPath) {
  console.error("Nothing to do. Pass --google-services and/or --service-account.");
  console.error("See the comment at the top of this file.");
  process.exit(1);
}

const problems = [];
const notes = [];
let gs = null;
let sa = null;

function readJson(path, label) {
  if (!existsSync(path)) {
    problems.push(`${label}: no file at ${path}`);
    return null;
  }
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    // The commonest cause: a key pasted into a text editor that re-wrapped
    // the PEM, so a raw newline sits inside a JSON string.
    problems.push(`${label}: not valid JSON — ${e.message.split("\n")[0]}`);
    return null;
  }
}

/* ---------- google-services.json ---------- */

if (gsPath) {
  gs = readJson(gsPath, "google-services.json");
  if (gs) {
    const clients = gs.client ?? [];
    const match = clients.find(
      (c) => c?.client_info?.android_client_info?.package_name === PACKAGE,
    );
    if (!match) {
      const found = clients
        .map((c) => c?.client_info?.android_client_info?.package_name ?? "?")
        .join(", ");
      problems.push(
        `google-services.json has no client for ${PACKAGE} (it has: ${found || "none"}). ` +
          `Gradle will fail with "No matching client found". In the Firebase console, ` +
          `Add app -> Android with ${PACKAGE} as the package name.`,
      );
    } else {
      notes.push(`google-services.json: ${gs.project_info?.project_id}, client for ${PACKAGE}`);
      notes.push(`  app id: ${match.client_info.mobilesdk_app_id}`);
    }
  }
}

/* ---------- the service account ---------- */

if (saPath) {
  sa = readJson(saPath, "service account");
  if (sa) {
    for (const field of ["project_id", "client_email", "private_key"]) {
      if (!sa[field]) problems.push(`service account: missing ${field}`);
    }
    if (sa.private_key) {
      // The check the app's own fcmConfigured() does NOT do.
      const key = sa.private_key.replace(/\\n/g, "\n");
      try {
        createSign("RSA-SHA256").update("probe").sign(key);
        notes.push(`service account: ${sa.project_id}, key signs`);
      } catch (e) {
        problems.push(
          `service account: the private key will not sign — ${e.message.split("\n")[0]}. ` +
            `Download a fresh key rather than editing this one.`,
        );
      }
    }
  }
}

/* ---------- the two must name the SAME project ---------- */

if (gs && sa && gs.project_info?.project_id && sa.project_id) {
  if (gs.project_info.project_id !== sa.project_id) {
    problems.push(
      `project mismatch: google-services.json is ${gs.project_info.project_id} but the ` +
        `service account is ${sa.project_id}. Tokens minted by one project are rejected ` +
        `by the other, and nothing reports it — notifications simply never arrive.`,
    );
  } else {
    notes.push(`both name the same project: ${sa.project_id}`);
  }
}

/* ---------- report ---------- */

for (const n of notes) console.log("  ok   " + n);
if (problems.length) {
  console.error("");
  for (const p of problems) console.error("  STOP " + p);
  console.error("\nNothing was set.");
  process.exit(1);
}

if (dryRun) {
  console.log("\n--dry-run: everything checks out, nothing set.");
  process.exit(0);
}

/* ---------- set them ---------- */

function setSecret(name, value) {
  execFileSync("gh", ["secret", "set", name, "--repo", REPO], { input: value, stdio: ["pipe", "inherit", "inherit"] });
  console.log(`  set  ${name}`);
}

if (gs) {
  // The workflow base64-decodes this one.
  setSecret("GOOGLE_SERVICES_JSON", Buffer.from(readFileSync(gsPath)).toString("base64"));

  const appId = gs.client.find(
    (c) => c.client_info.android_client_info.package_name === PACKAGE,
  ).client_info.mobilesdk_app_id;
  setSecret("FIREBASE_APP_ID", appId);
}

if (sa) {
  // One line, with the \n inside private_key left as they are.
  const oneLine = JSON.stringify(sa);
  setSecret("FIREBASE_SERVICE_ACCOUNT", oneLine);

  console.log("\nFCM_SERVICE_ACCOUNT is a VERCEL variable, not a GitHub secret —");
  console.log("the Next.js server reads it at runtime. Set it with:");
  console.log("");
  console.log(`  node scripts/set-firebase-secrets.mjs --service-account ${saPath} --print-fcm`);
  console.log("");
  console.log("then paste that one line into Vercel -> Settings -> Environment Variables.");
}

if (argv.includes("--print-fcm")) {
  if (!sa) {
    console.error("--print-fcm needs --service-account");
    process.exit(1);
  }
  console.log("\n--- FCM_SERVICE_ACCOUNT, copy everything between the markers ---");
  console.log(JSON.stringify(sa));
  console.log("--- end ---");
}
