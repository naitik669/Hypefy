import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Uploading an avatar or a banner failed with
 *   new row violates row-level security policy for table "objects"
 *
 * The message names the write, and the write was never the problem. The
 * avatars and banners buckets carry insert, update and delete policies and
 * no select policy: they are public, so every read in the app goes over the
 * CDN path, which does not consult RLS, and nothing ever needed to select
 * from storage.objects.
 *
 * Both call sites asked for `upsert: true`. That makes storage read the row
 * back, Postgres applies select policies to a row an insert returns, and
 * with no select policy the statement is rejected — pointing at the insert.
 *
 * Shots upload fine, which is what gave it away: same shape, same bucket
 * rules, `upsert: false`, 200. The paths here all carry Date.now(), so
 * there was never anything to overwrite and the upsert bought nothing.
 *
 * 0196 adds the missing select policies so an upsert would work too; these
 * tests hold the client side, which is what ships without a migration.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const CALLERS = [
  "src/components/onboarding/SetupStepper.tsx",
  "src/components/settings/EditProfileForm.tsx",
];

describe("avatar and banner uploads", () => {
  it("never ask for an upsert", () => {
    for (const f of CALLERS) {
      // The option, not the word: the comment above it explains the whole
      // bug and says "upsert" several times.
      expect(read(f), f).not.toMatch(/upsert:\s*true/);
      expect(read(f), f).toMatch(/upsert:\s*false/);
    }
  });

  it("and upload to a path that is new every time, so none is needed", () => {
    for (const f of CALLERS) {
      // The prefix differs — onboarding hard-codes "avatar-", the edit form
      // interpolates ${kind} — so match anything between the folder and the
      // clock rather than a literal.
      expect(read(f), f).toMatch(/`\$\{userId\}\/[^`]*\$\{Date\.now\(\)\}/);
    }
  });

  it("the migration that would also fix it server-side is present", () => {
    // Belt and braces: with the client no longer upserting this is not on
    // the critical path, but a bucket you can write and cannot read back is
    // a trap for whoever next reaches for upsert.
    const sql = read("supabase/migrations/0196_own_files_are_readable.sql");
    expect(sql).toContain("create policy avatars_user_select");
    expect(sql).toContain("create policy banners_user_select");
    expect(sql).toContain("for select");
  });
});
