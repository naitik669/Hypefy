import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  DELETE_ACCOUNT_PATH,
  bearerToken,
  confirmWord,
  deleteErrorMessage,
  isArmed,
  requestAccountDeletion,
  type DeleteTransport,
} from "@hypefy/core/account-delete";
import {
  confirmIdentity,
  deleteMyAccount,
  stepUpFor,
  type DeleteAuth,
} from "../apps/mobile/src/settings/delete";
import { LEGAL_LINKS } from "../apps/mobile/src/settings/links";
import { isOpenPath } from "@/lib/invite-gate";

/**
 * The phone's Settings, and the reason it was built: Google Play requires
 * an app that creates accounts to let them be deleted from inside it.
 *
 * Driven wherever it can be. The rule, the request, the step-up, the route
 * and the gate are all called; only the screens' wiring, which needs a
 * device, is read — with comments and imports stripped first, because both
 * have stood in for code in this repository before.
 */

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Comments and imports gone. */
function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

// ─── the shared rule ────────────────────────────────────────────────────────

describe("one rule for arming deletion, both clients", () => {
  it("the word is the username, or 'delete' without one", () => {
    expect(confirmWord("maya")).toBe("maya");
    expect(confirmWord(null)).toBe("delete");
    expect(confirmWord("  ")).toBe("delete");
  });

  it("arms on the word, ignoring case and outer spaces, and on nothing else", () => {
    expect(isArmed(" MAYA ", "maya")).toBe(true);
    expect(isArmed("may", "maya")).toBe(false);
    expect(isArmed("delete", "maya")).toBe(false);
    expect(isArmed("Delete", null)).toBe(true);
    expect(isArmed("", null)).toBe(false);
  });

  it("the web's Danger zone calls the shared rule and the shared request", () => {
    const web = body("src/components/settings/DeleteAccount.tsx");
    expect(web).toMatch(/const armed = isArmed\(typed, username\)/);
    expect(web).toMatch(/await requestAccountDeletion\(\{ site: ""/);
    // And no longer keeps a fetch of its own beside it.
    expect(web).not.toMatch(/fetch\("\/api\/account\/delete"/);
  });
});

describe("the request", () => {
  function transport(res: { ok: boolean; status: number; json?: unknown } | Error) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const t: DeleteTransport = async (url, init) => {
      calls.push({ url, headers: init.headers });
      if (res instanceof Error) throw res;
      return { ok: res.ok, status: res.status, json: async () => res.json ?? null };
    };
    return { t, calls };
  }

  it("posts to the route on the given site, with the token when there is one", async () => {
    const { t, calls } = transport({ ok: true, status: 200 });
    expect(await requestAccountDeletion({ site: "https://x.test", accessToken: "tok", transport: t })).toEqual({ ok: true });
    expect(calls).toEqual([{ url: `https://x.test${DELETE_ACCOUNT_PATH}`, headers: { Authorization: "Bearer tok" } }]);
  });

  it("sends no Authorization at all on the web, where the cookie is the credential", async () => {
    const { t, calls } = transport({ ok: true, status: 200 });
    await requestAccountDeletion({ site: "", transport: t });
    expect(calls[0].url).toBe("/api/account/delete");
    expect(calls[0].headers).toEqual({});
  });

  it("says what the route said, and translates its two machine words", async () => {
    const files = "Couldn't remove your photos and videos. Nothing else was deleted. Try again.";
    const cases: [number, unknown, RegExp][] = [
      [500, { error: files }, /Nothing else was deleted/],
      [403, { error: "mfa_required" }, /authenticator code/],
      [401, { error: "unauthorized" }, /signed out/],
      [401, null, /signed out/],
      [500, null, /^Deletion failed\. Try again\.$/],
    ];
    for (const [status, json, want] of cases) {
      const { t } = transport({ ok: false, status, json });
      const r = await requestAccountDeletion({ site: "", transport: t });
      expect(r.ok).toBe(false);
      expect(r.ok ? "" : r.error).toMatch(want);
      expect(deleteErrorMessage(status, json)).toMatch(want);
    }
  });

  it("a dropped connection is a failure that says so, not a throw", async () => {
    const { t } = transport(new Error("offline"));
    const r = await requestAccountDeletion({ site: "", transport: t });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Couldn't reach Hypefy/) });
  });
});

describe("reading the bearer header", () => {
  it("takes exactly a bearer token, and nothing that only resembles one", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
  });
});

// ─── the phone's flow ───────────────────────────────────────────────────────

function fakeAuth(opts: {
  factors?: { id: string; factor_type: string; status: string }[];
  verifyError?: unknown;
  passwordError?: unknown;
  token?: string | null;
}) {
  const log: string[] = [];
  const auth: DeleteAuth = {
    mfa: {
      listFactors: async () => ({ data: { all: opts.factors ?? [] } }),
      challengeAndVerify: async ({ factorId, code }) => {
        log.push(`verify ${factorId} ${code}`);
        return { error: opts.verifyError ?? null };
      },
    },
    getUser: async () => ({ data: { user: { email: "maya@example.com" } } }),
    signInWithPassword: async ({ email, password }) => {
      log.push(`password ${email} ${password}`);
      return { error: opts.passwordError ?? null };
    },
    getSession: async () => {
      log.push("session");
      return { data: { session: opts.token === null ? null : { access_token: opts.token ?? "fresh" } } };
    },
    signOut: async ({ scope }) => {
      log.push(`signout ${scope}`);
    },
  };
  return { auth, log };
}

describe("'Confirm it's you' on the phone, decided as the web decides it", () => {
  it("the authenticator code when there is a VERIFIED factor, the password otherwise", async () => {
    expect(await stepUpFor(fakeAuth({ factors: [{ id: "f1", factor_type: "totp", status: "verified" }] }).auth))
      .toEqual({ mode: "totp", factorId: "f1" });
    expect(await stepUpFor(fakeAuth({ factors: [{ id: "f1", factor_type: "totp", status: "unverified" }] }).auth))
      .toEqual({ mode: "password" });
    expect(await stepUpFor(fakeAuth({}).auth)).toEqual({ mode: "password" });
  });

  it("a code goes to that factor, digits only", async () => {
    const { auth, log } = fakeAuth({});
    expect(await confirmIdentity(auth, { mode: "totp", factorId: "f1" }, "12 34-56")).toBeNull();
    expect(log).toEqual(["verify f1 123456"]);
  });

  it("a password is checked against the account's own email", async () => {
    const { auth, log } = fakeAuth({});
    expect(await confirmIdentity(auth, { mode: "password" }, "hunter2")).toBeNull();
    expect(log).toEqual(["password maya@example.com hunter2"]);
  });

  it("a wrong answer is a message, and an empty one never reaches GoTrue", async () => {
    const wrong = fakeAuth({ verifyError: new Error("bad"), passwordError: new Error("bad") });
    expect(await confirmIdentity(wrong.auth, { mode: "totp", factorId: "f1" }, "000000")).toBe("That code didn't match.");
    expect(await confirmIdentity(wrong.auth, { mode: "password" }, "x")).toBe("That password isn't right.");

    const empty = fakeAuth({});
    expect(await confirmIdentity(empty.auth, { mode: "password" }, "  ")).toMatch(/Enter your password/);
    expect(await confirmIdentity(empty.auth, { mode: "totp", factorId: "f1" }, "ab")).toMatch(/6-digit/);
    expect(empty.log).toEqual([]);
  });
});

describe("deleting from the phone", () => {
  const ok: DeleteTransport = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });

  it("sends the session's token, then forgets the session locally", async () => {
    const { auth, log } = fakeAuth({ token: "after-stepup" });
    const seen: string[] = [];
    const r = await deleteMyAccount({
      auth,
      site: "https://app.hypefy.chat",
      transport: async (url, init) => {
        seen.push(`${url} ${init.headers.Authorization}`);
        return ok(url, init);
      },
    });
    expect(r).toEqual({ ok: true });
    expect(seen).toEqual(["https://app.hypefy.chat/api/account/delete Bearer after-stepup"]);
    // Local: GoTrue no longer has this user to revoke a session for.
    expect(log).toEqual(["session", "signout local"]);
  });

  it("a refused deletion keeps the person signed in, and says why", async () => {
    const { auth, log } = fakeAuth({});
    const r = await deleteMyAccount({
      auth,
      site: "",
      transport: async () => ({ ok: false, status: 403, json: async () => ({ error: "mfa_required" }) }),
    });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/authenticator/) });
    expect(log).not.toContain("signout local");
  });

  it("with no session it sends nothing", async () => {
    const { auth } = fakeAuth({ token: null });
    const sent = vi.fn(ok);
    const r = await deleteMyAccount({ auth, site: "", transport: sent });
    expect(r.ok).toBe(false);
    expect(sent).not.toHaveBeenCalled();
  });
});

// ─── the route, called ──────────────────────────────────────────────────────

const route = vi.hoisted(() => ({
  tokenUser: null as null | { id: string; factors?: { status: string }[] },
  cookieUser: null as null | { id: string; factors?: { status: string }[] },
  cookieToken: undefined as string | undefined,
  getUserArgs: [] as unknown[],
  deleted: [] as string[],
  cookieClientMade: 0,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("@/lib/account-files", () => ({ removeFilesOf: async () => ({ ok: true, removed: 0 }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    route.cookieClientMade++;
    return {
      auth: {
        getUser: async () => ({ data: { user: route.cookieUser } }),
        getSession: async () => ({ data: { session: route.cookieToken ? { access_token: route.cookieToken } : null } }),
      },
    };
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (jwt: unknown) => {
        route.getUserArgs.push(jwt);
        return { data: { user: route.tokenUser } };
      },
      admin: {
        deleteUser: async (id: string) => {
          route.deleted.push(id);
          return { error: null };
        },
      },
    },
  }),
}));

/** An unsigned JWT carrying an aal claim — readAal only decodes. */
function jwt(aal: string): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "none" })}.${b64({ aal })}.sig`;
}

describe("POST /api/account/delete, from a phone with no cookie", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    Object.assign(route, {
      tokenUser: null,
      cookieUser: null,
      cookieToken: undefined,
      getUserArgs: [],
      deleted: [],
      cookieClientMade: 0,
    });
  });
  afterEach(() => {
    process.env = { ...env };
  });

  async function post(headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/account/delete/route");
    return POST(new Request("https://app.hypefy.chat/api/account/delete", { method: "POST", headers }));
  }

  it("deletes the account the token belongs to, validated against GoTrue", async () => {
    const token = jwt("aal1");
    route.tokenUser = { id: "u-phone" };
    const res = await post({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(route.getUserArgs).toEqual([token]);
    expect(route.deleted).toEqual(["u-phone"]);
  });

  it("a token GoTrue does not accept is a 401, and never falls through to a cookie", async () => {
    route.tokenUser = null;
    route.cookieUser = { id: "u-cookie" };
    const res = await post({ Authorization: "Bearer forged" });
    expect(res.status).toBe(401);
    expect(route.cookieClientMade).toBe(0);
    expect(route.deleted).toEqual([]);
  });

  it("an account with a second factor needs an aal2 TOKEN", async () => {
    route.tokenUser = { id: "u-mfa", factors: [{ status: "verified" }] };
    const low = await post({ Authorization: `Bearer ${jwt("aal1")}` });
    expect(low.status).toBe(403);
    expect(await low.json()).toEqual({ error: "mfa_required" });
    expect(route.deleted).toEqual([]);

    const high = await post({ Authorization: `Bearer ${jwt("aal2")}` });
    expect(high.status).toBe(200);
    expect(route.deleted).toEqual(["u-mfa"]);
  });

  it("the website's cookie path still works, and still 401s without a session", async () => {
    route.cookieUser = { id: "u-web" };
    expect((await post()).status).toBe(200);
    expect(route.getUserArgs).toEqual([]);
    expect(route.deleted).toEqual(["u-web"]);

    route.cookieUser = null;
    expect((await post()).status).toBe(401);
  });

  it("and the cookie path's second-factor check reads the cookie session's token", async () => {
    route.cookieUser = { id: "u-web-mfa", factors: [{ status: "verified" }] };
    route.cookieToken = jwt("aal1");
    expect((await post()).status).toBe(403);
    route.cookieToken = jwt("aal2");
    expect((await post()).status).toBe(200);
  });
});

// ─── the gate and the footer ────────────────────────────────────────────────

describe("what the phone opens on the website", () => {
  it("the deletion route is past the invite gate — the phone can never carry its cookie", () => {
    expect(isOpenPath(DELETE_ACCOUNT_PATH)).toBe(true);
  });

  it("every legal link is a page the gate leaves open, and one the website's footer has", () => {
    const web = read("src/app/(app)/settings/page.tsx");
    expect(LEGAL_LINKS.length).toBeGreaterThan(3);
    for (const link of LEGAL_LINKS) {
      expect(isOpenPath(link.path), `${link.path} opens on the invite wall`).toBe(true);
      expect(web, `${link.path} is not in the website's footer`).toContain(`href="${link.path}"`);
      expect(web).toContain(link.label);
    }
  });
});

// ─── the screens' wiring (needs a device, so read) ─────────────────────────

describe("the path /delete-account promises: profile → Settings → Account → Delete", () => {
  it("the public page still describes that path", () => {
    const page = read("src/app/(legal)/delete-account/page.tsx");
    expect(page).toMatch(/Open your profile, then Settings\./);
    expect(page).toMatch(/Choose Account\./);
  });

  it("the loaded Profile tab opens Settings", () => {
    const tab = body("apps/mobile/app/(tabs)/profile.tsx");
    const footer = tab.slice(tab.indexOf("footer={"));
    expect(footer).toMatch(/router\.push\("\/settings"\)/);
  });

  it("Settings opens Account", () => {
    const hub = body("apps/mobile/app/settings/index.tsx");
    expect(hub).toMatch(/label="Account"[\s\S]*?onPress=\{\(\) => router\.push\("\/settings\/account"\)\}/);
  });

  it("Account renders the Danger zone with the username, and a sign-out", () => {
    const acct = body("apps/mobile/app/settings/account.tsx");
    expect(acct).toMatch(/<DeleteAccount username=\{state\.username\} \/>/);
    expect(acct).toMatch(/<SignOutRow \/>/);
  });

  it("the button asks who you are before it deletes, and leaves after", () => {
    const src = body("apps/mobile/src/settings/DeleteAccount.tsx");
    // "Delete forever" in the typing phase only opens the step-up.
    const ask = src.slice(src.indexOf("const askIdentity"), src.indexOf("const destroy"));
    expect(ask).toMatch(/if \(!armed \|\| busy\) return;/);
    expect(ask).toMatch(/stepUpFor\(auth\)/);
    expect(ask).not.toMatch(/deleteMyAccount/);

    const destroy = src.slice(src.indexOf("const destroy"), src.indexOf("return (", src.indexOf("const destroy")));
    const verify = destroy.indexOf("await confirmIdentity(auth, step, secret)");
    const gate = destroy.indexOf("if (problem)");
    const del = destroy.indexOf("await deleteMyAccount(");
    const leave = destroy.indexOf('router.replace("/onboarding")');
    expect(verify).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(verify);
    expect(del).toBeGreaterThan(gate);
    expect(leave).toBeGreaterThan(del);
    // Leaving only on success.
    expect(destroy.slice(del, leave)).toMatch(/if \(!result\.ok\) \{\s*setError\(result\.error\);\s*return;/);
    // And to the real site, with the real token.
    expect(destroy).toMatch(/site: siteOrigin\(\)/);
  });

  it("the typed word arms the button through the shared rule", () => {
    const src = body("apps/mobile/src/settings/DeleteAccount.tsx");
    expect(src).toMatch(/const armed = isArmed\(typed, username\)/);
    expect(src).toMatch(/disabled=\{!armed \|\| busy\}/);
  });
});
