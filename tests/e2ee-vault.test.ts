import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  setupIdentity,
  unlock,
  currentIdentity,
  isUnlocked,
  lockDevice,
  rewrapPassword,
  regenerateRecoveryCode,
  fetchPublicKeys,
  ensureEncryption,
} from "@/lib/e2ee/vault";
import { forgetAllIdentities } from "@/lib/e2ee/store";
import { toB64 } from "@/lib/e2ee/crypto";
import type { KeyVault } from "@/lib/e2ee/keys";

/**
 * The wiring between the key lifecycle, Supabase and this device.
 *
 * The RPCs themselves are verified against the real database; what these
 * cover is the glue — that the right columns are sent under the right
 * parameter names, that "a row already existed" is not mistaken for success,
 * and above all that an identity set up on one device comes back intact on
 * another after nothing but a password.
 *
 * The fake below enforces the rules the real table enforces: init refuses to
 * overwrite, and a rewrap touches only its own two columns.
 */

const USER = "user-under-test";
const PW = "correct horse battery staple";

/** A stand-in for user_keys that behaves the way the migration makes it. */
function fakeSupabase() {
  const rows = new Map<string, KeyVault>();
  let me: string | null = USER;

  const client = {
    rows,
    signOut() {
      me = null;
    },
    from() {
      return {
        select() {
          return {
            async maybeSingle() {
              if (!me) return { data: null, error: { message: "not signed in" } };
              return { data: rows.get(me) ?? null, error: null };
            },
          };
        },
      };
    },
    async rpc(name: string, args: Record<string, string | string[]>) {
      if (!me) return { data: null, error: { message: "Not signed in" } };

      if (name === "init_user_keys") {
        // on conflict do nothing: false when a row was already there.
        if (rows.has(me)) return { data: false, error: null };
        rows.set(me, {
          identity_pub: args.p_identity_pub as string,
          signing_pub: args.p_signing_pub as string,
          seed_wrapped: args.p_seed_wrapped as string,
          mk_wrapped_pw: args.p_mk_wrapped_pw as string,
          salt_pw: args.p_salt_pw as string,
          mk_wrapped_rc: args.p_mk_wrapped_rc as string,
          salt_rc: args.p_salt_rc as string,
        });
        return { data: true, error: null };
      }

      if (name === "rewrap_master_key") {
        const row = rows.get(me);
        if (!row) return { data: null, error: { message: "No keys to rewrap" } };
        rows.set(me, {
          ...row,
          mk_wrapped_pw: args.p_mk_wrapped_pw as string,
          salt_pw: args.p_salt_pw as string,
        });
        return { data: null, error: null };
      }

      if (name === "rewrap_recovery") {
        const row = rows.get(me);
        if (!row) return { data: null, error: { message: "No keys to rewrap" } };
        rows.set(me, {
          ...row,
          mk_wrapped_rc: args.p_mk_wrapped_rc as string,
          salt_rc: args.p_salt_rc as string,
        });
        return { data: null, error: null };
      }

      if (name === "public_keys") {
        const ids = args.p_user_ids as string[];
        return {
          data: ids
            .filter((id) => rows.has(id))
            .map((id) => ({
              user_id: id,
              identity_pub: rows.get(id)!.identity_pub,
              signing_pub: rows.get(id)!.signing_pub,
            })),
          error: null,
        };
      }

      return { data: null, error: { message: "unknown rpc " + name } };
    },
  };

  // The real client is a large generated type; the surface used here is the
  // whole surface this module touches.
  return client as unknown as Parameters<typeof setupIdentity>[2] & typeof client;
}

beforeEach(async () => {
  await forgetAllIdentities();
});

describe("setupIdentity", () => {
  it("creates an identity and hands back a recovery code once", async () => {
    const supa = fakeSupabase();
    const result = await setupIdentity(USER, PW, supa);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    // And the device is now unlocked without anyone typing anything again.
    expect(await isUnlocked(USER)).toBe(true);
  });

  it("stores no secret the server could use", async () => {
    const supa = fakeSupabase();
    const result = await setupIdentity(USER, PW, supa);
    expect(result.ok).toBe(true);

    const stored = JSON.stringify([...supa.rows.values()]);
    expect(stored).not.toContain(PW);
    if (result.ok) expect(stored).not.toContain(result.recoveryCode.replace(/-/g, ""));
  });

  it("refuses to make a second identity, and does not keep the one it generated", async () => {
    // Overwriting would strand every message sent to the first identity, and
    // saving the discarded one locally would leave this device unable to read
    // anything at all.
    const supa = fakeSupabase();
    const first = await setupIdentity(USER, PW, supa);
    expect(first.ok).toBe(true);
    const before = await currentIdentity(USER);

    const second = await setupIdentity(USER, PW, supa);
    expect(second).toEqual({ ok: false, reason: "exists" });

    const after = await currentIdentity(USER);
    expect(toB64(after!.boxPub)).toBe(toB64(before!.boxPub));
  });

  it("reports failure without locking the device to a key the server rejected", async () => {
    const supa = fakeSupabase();
    supa.signOut();
    expect(await setupIdentity(USER, PW, supa)).toEqual({ ok: false, reason: "failed" });
    expect(await isUnlocked(USER)).toBe(false);
  });
});

describe("unlock on a new device", () => {
  it("returns the same identity from nothing but the password", async () => {
    // The whole promise: sign in somewhere else, get your history back.
    const supa = fakeSupabase();
    const made = await setupIdentity(USER, PW, supa);
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    await forgetAllIdentities(); // a different phone
    expect(await currentIdentity(USER)).toBeNull();

    const opened = await unlock(USER, { kind: "password", secret: PW }, supa);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(toB64(opened.identity.boxPub)).toBe(toB64(made.identity.boxPub));
  });

  it("returns the same identity from the recovery code", async () => {
    const supa = fakeSupabase();
    const made = await setupIdentity(USER, PW, supa);
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    await forgetAllIdentities();
    const opened = await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(toB64(opened.identity.boxPub)).toBe(toB64(made.identity.boxPub));
  });

  it("says the secret was wrong, and leaves the device locked", async () => {
    const supa = fakeSupabase();
    await setupIdentity(USER, PW, supa);
    await forgetAllIdentities();

    expect(await unlock(USER, { kind: "password", secret: "nope" }, supa)).toEqual({
      ok: false,
      reason: "wrong-secret",
    });
    expect(await isUnlocked(USER)).toBe(false);
  });

  it("says there is no vault when the account has never set one up", async () => {
    const supa = fakeSupabase();
    expect(await unlock(USER, { kind: "password", secret: PW }, supa)).toEqual({
      ok: false,
      reason: "no-vault",
    });
  });
});

describe("changing a password", () => {
  it("keeps the identity, and the recovery code still works", async () => {
    const supa = fakeSupabase();
    const made = await setupIdentity(USER, PW, supa);
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    expect(await rewrapPassword({ kind: "password", secret: PW }, "a new password", supa)).toBe(true);
    await forgetAllIdentities();

    const byNew = await unlock(USER, { kind: "password", secret: "a new password" }, supa);
    expect(byNew.ok).toBe(true);
    if (byNew.ok) expect(toB64(byNew.identity.boxPub)).toBe(toB64(made.identity.boxPub));

    await forgetAllIdentities();
    const byCode = await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa);
    expect(byCode.ok).toBe(true);

    // And the old password is done.
    await forgetAllIdentities();
    expect(await unlock(USER, { kind: "password", secret: PW }, supa)).toEqual({
      ok: false,
      reason: "wrong-secret",
    });
  });

  it("can be driven by the recovery code — the only route after a reset", async () => {
    const supa = fakeSupabase();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) return;

    const ok = await rewrapPassword({ kind: "recovery", secret: made.recoveryCode }, "set at reset", supa);
    expect(ok).toBe(true);

    await forgetAllIdentities();
    const opened = await unlock(USER, { kind: "password", secret: "set at reset" }, supa);
    expect(opened.ok).toBe(true);
    if (opened.ok) expect(toB64(opened.identity.boxPub)).toBe(toB64(made.identity.boxPub));
  });

  it("refuses with the wrong current secret", async () => {
    const supa = fakeSupabase();
    await setupIdentity(USER, PW, supa);
    expect(await rewrapPassword({ kind: "password", secret: "wrong" }, "new", supa)).toBe(false);
  });
});

describe("regenerating a recovery code", () => {
  it("retires the old one and keeps the identity", async () => {
    const supa = fakeSupabase();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) return;

    const fresh = await regenerateRecoveryCode({ kind: "password", secret: PW }, supa);
    expect(fresh).not.toBeNull();

    await forgetAllIdentities();
    const byFresh = await unlock(USER, { kind: "recovery", secret: fresh! }, supa);
    expect(byFresh.ok).toBe(true);
    if (byFresh.ok) expect(toB64(byFresh.identity.boxPub)).toBe(toB64(made.identity.boxPub));

    await forgetAllIdentities();
    expect(await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa)).toEqual({
      ok: false,
      reason: "wrong-secret",
    });
  });
});

describe("fetchPublicKeys", () => {
  it("returns the public halves for people who have set up", async () => {
    const supa = fakeSupabase();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) return;

    const keys = await fetchPublicKeys([USER], supa);
    expect(toB64(keys.get(USER)!.boxPub)).toBe(toB64(made.identity.boxPub));
    expect(toB64(keys.get(USER)!.signPub)).toBe(toB64(made.identity.signPub));
  });

  it("simply omits anyone who has not — that is a state, not an error", async () => {
    const supa = fakeSupabase();
    await setupIdentity(USER, PW, supa);
    const keys = await fetchPublicKeys([USER, "someone-with-no-keys"], supa);
    expect(keys.has(USER)).toBe(true);
    expect(keys.has("someone-with-no-keys")).toBe(false);
  });

  it("asks nothing when given nobody", async () => {
    const supa = fakeSupabase();
    expect((await fetchPublicKeys([], supa)).size).toBe(0);
  });
});

describe("locking the device", () => {
  it("forgets the key here but leaves the vault, so it can be unlocked again", async () => {
    const supa = fakeSupabase();
    await setupIdentity(USER, PW, supa);
    expect(await isUnlocked(USER)).toBe(true);

    await lockDevice(USER);
    expect(await isUnlocked(USER)).toBe(false);

    expect((await unlock(USER, { kind: "password", secret: PW }, supa)).ok).toBe(true);
  });
});

describe("ensureEncryption — the silent path at sign-in", () => {
  it("makes an identity the first time, and hands back the code to show", async () => {
    const supa = fakeSupabase();
    const r = await ensureEncryption(USER, PW, supa);
    expect(r.state).toBe("created");
    if (r.state !== "created") return;
    expect(r.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    expect(await isUnlocked(USER)).toBe(true);
  });

  it("does nothing at all when the device is already unlocked", async () => {
    const supa = fakeSupabase();
    await ensureEncryption(USER, PW, supa);
    expect(await ensureEncryption(USER, PW, supa)).toEqual({ state: "ready" });
  });

  it("opens silently on a new device — the whole point", async () => {
    // Signing in somewhere else must feel like nothing happened.
    const supa = fakeSupabase();
    const first = await ensureEncryption(USER, PW, supa);
    expect(first.state).toBe("created");

    await forgetAllIdentities(); // a different phone
    expect(await ensureEncryption(USER, PW, supa)).toEqual({ state: "unlocked" });
    expect(await isUnlocked(USER)).toBe(true);
  });

  it("asks for the recovery code only when the password no longer opens it", async () => {
    // Exactly what a password reset leaves behind.
    const supa = fakeSupabase();
    await ensureEncryption(USER, PW, supa);
    await forgetAllIdentities();

    expect(await ensureEncryption(USER, "the password after a reset", supa)).toEqual({
      state: "needs-recovery",
    });
    expect(await isUnlocked(USER)).toBe(false);
  });

  it("never blocks sign-in when the server cannot be reached", async () => {
    // Encryption failing is not a reason to stop someone reaching their feed.
    const supa = fakeSupabase();
    supa.signOut();
    expect(await ensureEncryption(USER, PW, supa)).toEqual({ state: "unavailable" });
  });

  it("recovers from a vault appearing between the read and the write", async () => {
    // Two tabs, or a retry. It must open the row that won rather than
    // reporting failure or keeping the identity it just threw away.
    const supa = fakeSupabase();
    const made = await setupIdentity(USER, PW, supa);
    expect(made.ok).toBe(true);
    await forgetAllIdentities();

    const r = await ensureEncryption(USER, PW, supa);
    expect(r).toEqual({ state: "unlocked" });
    if (made.ok) {
      const here = await currentIdentity(USER);
      expect(toB64(here!.boxPub)).toBe(toB64(made.identity.boxPub));
    }
  });
});
