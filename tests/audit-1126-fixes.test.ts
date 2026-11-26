import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  hasPasswordIdentity,
  sendStepUpCode,
  stepUpMethod,
  verifyStepUpCode,
  type StepUpCodeAuth,
} from "../packages/core/src/step-up";
import { reportMessage, type SafetyClient } from "../packages/core/src/safety";

/**
 * The five bugs the 26 Nov 2026 web audit measured on the live database.
 *
 * Each was found by calling things, not reading them: Postgres logs, a
 * `set role` as a signed-in user and as anon, and the auth tables. The
 * logic that takes its dependencies as arguments is driven here with fakes.
 * Source is read only for what cannot be run here: SQL policies, and which
 * component calls which function. Comments are stripped first, so a
 * sentence about the fix can't stand in for the fix.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const stripTs = (s: string) =>
  s.replace(/[/][*][\s\S]*?[*][/]/g, "").replace(/(^|[^:])[/][/].*$/gm, "$1");
const stripSql = (s: string) => s.replace(/--.*$/gm, "");

/** The body of one function in a source file, from its declaration to the next top-level one. */
function body(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `function ${name} exists`).toBeGreaterThan(-1);
  const next = src.slice(start + 1).search(/\n  (async )?function \w+\(/);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

// ── 1. The Shows ring ──────────────────────────────────────────────────

describe("0219: the Shows ring stops refusing", () => {
  const sql = stripSql(read("supabase/migrations/0219_shows_ring_and_signed_out_shots.sql"));
  const memberPolicy = (() => {
    const at = sql.indexOf(`create policy "collab members: visible inside the collab"`);
    expect(at).toBeGreaterThan(-1);
    return sql.slice(at, sql.indexOf(";", at));
  })();

  it("the members policy no longer reads show_collabs, which is what closed the loop", () => {
    // show_collabs' own policy reads show_collab_members. If this policy
    // reads show_collabs back, Postgres recurses and every embed fails.
    expect(memberPolicy).not.toMatch(/from\s+public\.show_collabs/);
    expect(memberPolicy).not.toMatch(/\bshow_collabs\s+c\b/);
  });

  it("and still lets the owner in, through a definer helper", () => {
    expect(memberPolicy).toContain("public.owns_show_collab(collab_id, (select auth.uid()))");
    expect(memberPolicy).toContain("public.in_show_collab(collab_id, (select auth.uid()))");
    expect(memberPolicy).toContain("user_id = (select auth.uid())");
    const fn = sql.slice(sql.indexOf("create or replace function public.owns_show_collab"));
    expect(fn.slice(0, 400)).toMatch(/security definer/);
    expect(fn.slice(0, 400)).toMatch(/c\.owner_id = p_user/);
  });

  it("drops the old policy first, so the recreate is not a second permissive policy", () => {
    const drop = sql.indexOf(`drop policy if exists "collab members: visible inside the collab"`);
    const create = sql.indexOf(`create policy "collab members: visible inside the collab"`);
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(create);
  });

  it("keeps the helper away from anon, like in_show_collab", () => {
    expect(sql).toMatch(/revoke all on function public\.owns_show_collab\(uuid, uuid\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.owns_show_collab\(uuid, uuid\) to authenticated;/);
  });
});

// ── 2. Signed-out visitors and Shots ───────────────────────────────────

describe("0219: signed-out visitors can read public Shots again", () => {
  const sql = stripSql(read("supabase/migrations/0219_shows_ring_and_signed_out_shots.sql"));

  it("grants is_hyper_of to anon, because the Shots read policy calls it", () => {
    expect(sql).toMatch(/grant execute on function public\.is_hyper_of\(uuid\) to anon;/);
  });

  it("and is_hyper_of still asks about the signed-in viewer only, so anon always gets false", () => {
    // The grant is safe only while the function keys on auth.uid(). If it
    // ever took the viewer as an argument, anon could ask about anyone.
    const def = stripSql(read("supabase/migrations/0210_shots_have_an_audience.sql"));
    const fn = def.slice(def.indexOf("create or replace function public.is_hyper_of"));
    expect(fn.slice(0, 400)).toMatch(/c\.friend_id = \(select auth\.uid\(\)\)/);
    expect(fn.slice(0, 120)).toMatch(/is_hyper_of\(p_author uuid\)/);
  });
});

// ── 3. Google-only accounts and the step-up ────────────────────────────

describe("step-up: every account gets a challenge it can answer", () => {
  const verifiedTotp = [{ factor_type: "totp", status: "verified" }];

  it("a Google-only account is sent an email code, not asked for a password it has none of", () => {
    expect(stepUpMethod({ factors: [], identities: [{ provider: "google" }] })).toBe("email_code");
    expect(stepUpMethod({ factors: null, identities: null })).toBe("email_code");
  });

  it("an account with a password still types it", () => {
    expect(stepUpMethod({ factors: [], identities: [{ provider: "email" }] })).toBe("password");
    expect(stepUpMethod({ factors: [], identities: [{ provider: "google" }, { provider: "email" }] })).toBe(
      "password",
    );
  });

  it("a verified authenticator wins over both, and an unverified one does not count", () => {
    expect(stepUpMethod({ factors: verifiedTotp, identities: [{ provider: "google" }] })).toBe("totp");
    expect(stepUpMethod({ factors: verifiedTotp, identities: [{ provider: "email" }] })).toBe("totp");
    expect(
      stepUpMethod({ factors: [{ factor_type: "totp", status: "unverified" }], identities: [{ provider: "email" }] }),
    ).toBe("password");
  });

  it("reads the password from the identities", () => {
    expect(hasPasswordIdentity([{ provider: "google" }])).toBe(false);
    expect(hasPasswordIdentity([{ provider: "email" }])).toBe(true);
    expect(hasPasswordIdentity(undefined)).toBe(false);
  });
});

function fakeAuth(answers: { send?: { message: string } | null; verify?: { message: string } | null } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const auth: StepUpCodeAuth = {
    signInWithOtp: async (args) => {
      calls.push({ fn: "signInWithOtp", args });
      return { error: answers.send ?? null };
    },
    verifyOtp: async (args) => {
      calls.push({ fn: "verifyOtp", args });
      return { error: answers.verify ?? null };
    },
  };
  return { auth, calls };
}

describe("step-up: the email code", () => {
  it("is sent without ever creating an account", async () => {
    const { auth, calls } = fakeAuth();
    expect(await sendStepUpCode(auth, "a@b.co")).toEqual({ ok: true });
    expect(calls).toEqual([
      { fn: "signInWithOtp", args: { email: "a@b.co", options: { shouldCreateUser: false } } },
    ]);
  });

  it("says so when sending fails, and sends nothing without an address", async () => {
    const failed = fakeAuth({ send: { message: "rate limited" } });
    expect((await sendStepUpCode(failed.auth, "a@b.co")).ok).toBe(false);
    const none = fakeAuth();
    expect((await sendStepUpCode(none.auth, "")).ok).toBe(false);
    expect(none.calls).toEqual([]);
  });

  it("is checked as an email OTP, digits only", async () => {
    const { auth, calls } = fakeAuth();
    expect(await verifyStepUpCode(auth, "a@b.co", "123 456")).toEqual({ ok: true });
    expect(calls).toEqual([{ fn: "verifyOtp", args: { email: "a@b.co", token: "123456", type: "email" } }]);
  });

  it("a wrong code is refused, which is the whole point", async () => {
    const { auth } = fakeAuth({ verify: { message: "Token has expired or is invalid" } });
    expect(await verifyStepUpCode(auth, "a@b.co", "000000")).toEqual({ ok: false, error: "That code didn't match." });
  });
});

describe("step-up: the screens use it", () => {
  const dialog = stripTs(read("src/components/auth/StepUpDialog.tsx"));
  const forms = stripTs(read("src/components/settings/AccountForms.tsx"));

  it("the dialog picks its challenge with stepUpMethod and sends the code for email_code", () => {
    expect(dialog).toMatch(/stepUpMethod\(\{ factors: all, identities: user\?\.identities \}\)/);
    expect(dialog).toMatch(/if \(method === "email_code"\) \{[\s\S]{0,200}sendStepUpCode\(supabase\.auth, address\)/);
  });

  it("and checks the code before it reports success", () => {
    const submit = body(dialog, "submit");
    const branch = submit.slice(submit.indexOf(`if (mode === "email_code")`));
    expect(branch).toMatch(/verifyStepUpCode\(supabase\.auth, email, value\)/);
    expect(branch.indexOf("verifyStepUpCode")).toBeLessThan(branch.indexOf("onDone(true)"));
    expect(branch.slice(0, branch.indexOf("onDone(true)"))).toMatch(/if \(!checked\.ok\)[\s\S]*?return;/);
  });

  it("a Google-only account sets a password behind the step-up, with no current password asked", () => {
    expect(forms).toMatch(/setHasPassword\(hasPasswordIdentity\(user\?\.identities\)\)/);
    const first = body(forms, "setFirstPassword");
    expect(first).toMatch(/requireStepUp\(\{ maxAge: 0 \}\)/);
    expect(first.indexOf("requireStepUp")).toBeLessThan(first.indexOf("updateUser"));
    expect(first).not.toContain("signInWithPassword");
    expect(body(forms, "changePassword")).toMatch(/if \(hasPassword === false\) return setFirstPassword\(\);/);
  });
});

// ── 4 and 5. Reporting from a chat ─────────────────────────────────────

function fakeRpc(error: { code?: string; message?: string } | null) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ error });
    },
  } as unknown as SafetyClient;
  return { client, calls };
}

describe("reporting a message", () => {
  it("files it through report_message", async () => {
    const { client, calls } = fakeRpc(null);
    expect(await reportMessage(client, { messageId: "m1", reason: "spam" })).toEqual({ ok: true });
    expect(calls).toEqual([{ fn: "report_message", args: { p_message_id: "m1", p_reason: "spam" } }]);
  });

  it("a refusal is a failure, not 'already sent'", async () => {
    // report_message treats a repeat as success itself, so any error is real.
    const { client } = fakeRpc({ message: "Cannot report" });
    const out = await reportMessage(client, { messageId: "m1", reason: "spam" });
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).not.toMatch(/already/i);
  });

  it("the chat shows that outcome", () => {
    const chat = stripTs(read("src/components/messages/RealChatView.tsx"));
    const submit = body(chat, "submitReport");
    expect(submit).toMatch(/reportMessage\(supabase as never, \{ messageId: m\.id, reason \}\)/);
    expect(submit).toMatch(/showToast\(sent\.ok \? "Report sent" : sent\.error\)/);
    expect(submit).not.toMatch(/already sent/);
  });
});

describe("blocking from a chat", () => {
  it("says Blocked, because block_message_request files no report", () => {
    const chat = stripTs(read("src/components/messages/RealChatView.tsx"));
    const block = body(chat, "blockUser");
    expect(block).toMatch(/block_message_request/);
    expect(block).toMatch(/showToast\("Blocked"\)/);
    expect(block).not.toMatch(/reported/i);
  });
});
