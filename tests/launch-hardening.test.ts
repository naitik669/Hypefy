import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_PROFILE_COLUMNS, parsePrivateProfile } from "@/lib/profile";
import { MAX_PASSES, REMOVE_BATCH, batchesByBucket, removeFilesOf } from "@/lib/account-files";
import { attemptAllowed, attemptKey } from "@/lib/api-guard";

/**
 * The five things the backend audit of 2026-10-07 said had to be fixed before
 * launch: private profile columns, write limits, blocks on the messages
 * table, files on account deletion, and tries at the invite code.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const PRIVATE = ["date_of_birth", "is_admin", "suspension_reason", "suspended_by", "referred_by", "notif_prefs", "ghost_no_target"];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith("database.types.ts")) out.push(p);
  }
  return out;
}

describe("private profile columns", () => {
  const m130 = read("supabase/migrations/0130_private_profile_columns.sql");

  it("the table-wide read goes, and only named columns come back", () => {
    expect(m130).toContain("revoke select on public.profiles from anon, authenticated;");
    expect(m130).toMatch(/grant select \([^)]+\) on public\.profiles to anon, authenticated;/);
  });

  it("no private column is in the grant", () => {
    const granted = m130.match(/grant select \(([^)]+)\)/)![1].split(",").map((c) => c.trim());
    for (const col of PRIVATE) expect(granted).not.toContain(col);
  });

  it("the app asks for exactly the columns the database grants", () => {
    const granted = m130.match(/grant select \(([^)]+)\)/)![1].split(",").map((c) => c.trim()).sort();
    expect(PUBLIC_PROFILE_COLUMNS.split(",").map((c) => c.trim()).sort()).toEqual(granted);
  });

  it("nothing in the app reads a private column, or every column, off the table", () => {
    const offenders: string[] = [];
    for (const file of sources("src")) {
      const src = read(file);
      // Each read of profiles, up to the end of its select(...).
      for (const m of src.matchAll(/\.from\("profiles"\)\s*\.select\(\s*(["'`])([\s\S]*?)\1/g)) {
        const cols = m[2];
        if (cols.trim() === "*") offenders.push(`${file}: select("*")`);
        for (const col of PRIVATE) if (new RegExp(`\\b${col}\\b`).test(cols)) offenders.push(`${file}: ${col}`);
      }
      // Filtering on one needs the same permission as reading it.
      for (const m of src.matchAll(/\.from\("profiles"\)[\s\S]{0,300}?\.(eq|is|in|neq)\("(\w+)"/g)) {
        if (PRIVATE.includes(m[2])) offenders.push(`${file}: filter on ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the owner's private fields are read without trusting their shape", () => {
    expect(parsePrivateProfile(null)).toBeNull();
    expect(parsePrivateProfile("x")).toBeNull();
    expect(parsePrivateProfile([])).toBeNull();
    expect(parsePrivateProfile({})).toEqual({ dateOfBirth: null, isAdmin: false, suspensionReason: null, notifPrefs: {}, referralCount: 0 });
    expect(
      parsePrivateProfile({ date_of_birth: "2008-08-28", is_admin: true, suspension_reason: "spam", notif_prefs: { hypes: false }, referral_count: 3 }),
    ).toEqual({ dateOfBirth: "2008-08-28", isAdmin: true, suspensionReason: "spam", notifPrefs: { hypes: false }, referralCount: 3 });
    // "true" is not true: nobody becomes an admin by a string.
    expect(parsePrivateProfile({ is_admin: "true" })!.isAdmin).toBe(false);
  });

  it("only the signed-in owner can call for them", () => {
    const m129 = read("supabase/migrations/0129_launch_hardening.sql");
    expect(m129).toContain("where p.id = (select auth.uid());");
    expect(m129).toContain("revoke all on function public.my_private_profile() from public, anon;");
  });

  it("last seen is not written for someone who hid their activity", () => {
    expect(read("supabase/migrations/0129_launch_hardening.sql")).toContain(
      "set last_seen_at = case when show_activity is false then null else now() end",
    );
  });
});

describe("write limits and blocks", () => {
  const m129 = read("supabase/migrations/0129_launch_hardening.sql");

  it("every table a person can write to quickly has a limit", () => {
    for (const table of ["posts", "shots", "shows", "notes", "messages", "conversations", "hypes", "reposts", "shot_reposts", "saved_posts", "saved_shots", "saved_sounds"]) {
      expect(m129).toMatch(new RegExp(`create trigger rate_limit_${table} before insert on public\\.${table}\\s+for each row execute function public\\.tg_rate_limit\\(`));
    }
  });

  it("the messages table refuses a blocked sender itself", () => {
    expect(m129).toContain("create trigger messages_refuse_blocked before insert on public.messages");
    expect(m129).toContain("join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me");
  });
});

describe("files on account deletion", () => {
  const rows = (n: number, bucket = "post-images") => Array.from({ length: n }, (_, i) => ({ bucket_id: bucket, name: `u/${bucket}-${i}.jpg` }));

  function admin(passes: { bucket_id: string; name: string }[][], failOn?: string) {
    const removed: { bucket: string; paths: string[] }[] = [];
    let pass = 0;
    return {
      removed,
      client: {
        rpc: vi.fn(async () => ({ data: passes[Math.min(pass++, passes.length - 1)], error: null })),
        storage: {
          from: (bucket: string) => ({
            remove: async (paths: string[]) => {
              if (bucket === failOn) return { error: { message: "storage is down" } };
              removed.push({ bucket, paths });
              return { error: null };
            },
          }),
        },
      } as never,
    };
  }

  it("groups by bucket and cuts each bucket into batches", () => {
    const out = batchesByBucket([...rows(REMOVE_BATCH + 5), ...rows(2, "avatars")]);
    expect(out.map((b) => [b.bucket, b.paths.length])).toEqual([["post-images", REMOVE_BATCH], ["post-images", 5], ["avatars", 2]]);
  });

  it("removes everything, asking again until nothing is left", async () => {
    const a = admin([[...rows(3), ...rows(2, "chat-media")], rows(1, "voice-notes"), []]);
    expect(await removeFilesOf(a.client, "u")).toEqual({ ok: true, removed: 6 });
    expect(a.removed.map((r) => r.bucket)).toEqual(["post-images", "chat-media", "voice-notes"]);
  });

  it("an account with no files is fine", async () => {
    expect(await removeFilesOf(admin([[]]).client, "u")).toEqual({ ok: true, removed: 0 });
  });

  it("stops and says so when a bucket cannot be emptied", async () => {
    const res = await removeFilesOf(admin([[...rows(2, "avatars"), ...rows(2, "chat-media")]], "chat-media").client, "u");
    expect(res).toEqual({ ok: false, removed: 2, error: "chat-media: storage is down" });
  });

  it("gives up rather than loop for ever if the files never go", async () => {
    const a = admin([rows(1)]);
    const res = await removeFilesOf(a.client, "u");
    expect(res.ok).toBe(false);
    expect(a.removed).toHaveLength(MAX_PASSES);
  });

  it("the route removes the files first, and keeps the account if that fails", () => {
    const route = read("src/app/api/account/delete/route.ts");
    const files = route.indexOf("await removeFilesOf(admin, user.id)");
    const user = route.indexOf("admin.auth.admin.deleteUser(user.id)");
    expect(files).toBeGreaterThan(0);
    expect(user).toBeGreaterThan(files);
    expect(route.slice(files, user)).toContain("{ status: 500 }");
  });

  it("only the server's own key can list a person's files", () => {
    const m129 = read("supabase/migrations/0129_launch_hardening.sql");
    expect(m129).toContain("revoke all on function public.storage_paths_of(uuid) from public, anon, authenticated;");
  });
});

describe("tries at the invite code", () => {
  const req = (ip: string) => new Request("https://app.hypefy.chat/api/gate", { method: "POST", headers: { "x-forwarded-for": ip } });
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("the limiter is never given the address itself", async () => {
    const key = await attemptKey("gate", "203.0.113.9");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203");
    expect(await attemptKey("gate", "203.0.113.9")).toBe(key);
    expect(await attemptKey("other", "203.0.113.9")).not.toBe(key);
  });

  it("with no database to ask, it still stops after the limit, per address", async () => {
    const tries: boolean[] = [];
    for (let i = 0; i < 5; i++) tries.push(await attemptAllowed(req("198.51.100.1"), "t", 3, 60));
    expect(tries).toEqual([true, true, true, false, false]);
    expect(await attemptAllowed(req("198.51.100.2"), "t", 3, 60)).toBe(true);
  });

  it("the route checks before it reads the code, and answers 429", () => {
    const route = read("src/app/api/gate/route.ts");
    const check = route.indexOf('attemptAllowed(request, "gate", GATE_TRIES, GATE_WINDOW_SECONDS)');
    expect(check).toBeGreaterThan(0);
    expect(route.indexOf("await request.json()")).toBeGreaterThan(check);
    expect(route).toContain("{ status: 429 }");
    expect(route).toContain("export const GATE_TRIES = 10;");
  });
});
