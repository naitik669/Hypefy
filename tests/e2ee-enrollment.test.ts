import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  afterPasswordChange,
  afterPasswordReset,
  confirmRecovery,
  currentIdentity,
  encryptionState,
  enroll,
  ensureEncryption,
  fetchPublicKeys,
  forgetEncryptionState,
  isUnlocked,
  reissueRecoveryCode,
  setupIdentity,
  unlock,
} from "@/lib/e2ee/vault";
import { forgetAllIdentities, loadMasterKey, loadSeed, saveIdentity } from "@/lib/e2ee/store";
import { newSeed, toB64 } from "@/lib/e2ee/crypto";
import { fakeVaultSupabase, type FakeSupa } from "./helpers/fake-vault-supabase";

/**
 * Enrollment that does not depend on how somebody signed in.
 *
 * Signing in says who you are. Whether this device holds your keys, and
 * whether the vault has a recovery route its owner has actually seen, are
 * separate facts — and most people never type a password at all. These
 * tests hold the lifecycle to that: every state reachable, none of them
 * answered by making a second identity, and nothing relied on until the
 * recovery code was confirmed.
 *
 * Argon2id is deliberately slow, so these give themselves room.
 */

vi.setConfig({ testTimeout: 60_000 });

const USER = "user-a";
const OTHER = "user-b";
const PW = "correct horse battery staple";

type Supa = Parameters<typeof setupIdentity>[2];

function world() {
  const fake = fakeVaultSupabase(USER);
  return { fake, supa: fake as unknown as Supa & FakeSupa };
}

beforeEach(async () => {
  await forgetAllIdentities();
  forgetEncryptionState();
});

const boxOf = async (id: string) => toB64((await currentIdentity(id))!.boxPub);

// ── a vault without a password ─────────────────────────────────────────

describe("a vault made without a password — Google, an emailed code, a session that never ended", () => {
  it("is created with a recovery wrapper and no password wrapper", async () => {
    const { supa, fake } = world();
    const made = await setupIdentity(USER, null, supa);
    expect(made.ok).toBe(true);

    const row = fake.rows.get(USER)!;
    expect(row.mk_wrapped_pw).toBeNull();
    expect(row.salt_pw).toBeNull();
    expect(row.mk_wrapped_rc).toBeTruthy();
    expect(row.salt_rc).toBeTruthy();
  });

  it("stores nothing the server could read", async () => {
    const { supa, fake } = world();
    const made = await setupIdentity(USER, null, supa);
    if (!made.ok) throw new Error("setup failed");

    const stored = JSON.stringify([...fake.rows.values()]);
    expect(stored).not.toContain(made.recoveryCode.replace(/-/g, ""));
    expect(stored).not.toContain(toB64((await loadSeed(USER))!));
    expect(stored).not.toContain(toB64((await loadMasterKey(USER))!));
  });

  it("gives the device the master key, so it can mint wrappers later on its own", async () => {
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    expect(await loadMasterKey(USER)).not.toBeNull();
  });

  it("opens by recovery code and reaches the same identity", async () => {
    const { supa } = world();
    const made = await setupIdentity(USER, null, supa);
    if (!made.ok) throw new Error("setup failed");

    await forgetAllIdentities();
    const opened = await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa);
    expect(opened.ok).toBe(true);
    expect(await boxOf(USER)).toBe(toB64(made.identity.boxPub));
  });

  it("is not opened by a password — there is none to offer", async () => {
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    await forgetAllIdentities();

    expect(await unlock(USER, { kind: "password", secret: PW }, supa)).toEqual({
      ok: false,
      reason: "wrong-secret",
    });
    expect(await isUnlocked(USER)).toBe(false);
  });
});

// ── the state machine ──────────────────────────────────────────────────

describe("encryptionState", () => {
  it("says no-vault when nothing exists", async () => {
    const { supa } = world();
    expect(await encryptionState(USER, supa)).toEqual({ state: "no-vault" });
  });

  it("says unavailable — NOT no-vault — when the server cannot be reached", async () => {
    // The distinction that stops a dropped connection looking like a new
    // account and leading to a second identity.
    const { supa, fake } = world();
    await setupIdentity(USER, null, supa);
    forgetEncryptionState();
    fake.signOut();
    expect(await encryptionState(USER, supa)).toEqual({ state: "unavailable" });
  });

  it("is recovery-pending right after setup, and ready once confirmed", async () => {
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    expect(await encryptionState(USER, supa)).toEqual({ state: "recovery-pending" });

    expect(await confirmRecovery(USER, supa)).toBe(true);
    expect(await encryptionState(USER, supa)).toEqual({ state: "ready" });
  });

  it("is device-locked when a vault exists and this device has no key", async () => {
    const { supa } = world();
    await setupIdentity(USER, PW, supa);
    await confirmRecovery(USER, supa);
    await forgetAllIdentities();
    forgetEncryptionState();

    expect(await encryptionState(USER, supa)).toEqual({ state: "device-locked", canUsePassword: true });
  });

  it("reports whether a password could unlock it", async () => {
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    await forgetAllIdentities();
    forgetEncryptionState();

    expect(await encryptionState(USER, supa)).toEqual({ state: "device-locked", canUsePassword: false });
  });

  it("treats a leftover seed from a different identity as locked, not unlocked", async () => {
    // A deleted and recreated account, or a corrupt row. Trusting it would
    // encrypt under a key nobody can answer.
    const { supa } = world();
    await setupIdentity(USER, PW, supa);
    await confirmRecovery(USER, supa);
    await saveIdentity(USER, newSeed());
    forgetEncryptionState();

    expect((await encryptionState(USER, supa)).state).toBe("device-locked");
  });

  it("asks nothing of the network once a tab knows the account is ready", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, null, supa);
    await confirmRecovery(USER, supa);
    await encryptionState(USER, supa);

    const before = fake.calls.length;
    for (let i = 0; i < 5; i++) expect(await encryptionState(USER, supa)).toEqual({ state: "ready" });
    expect(fake.calls.length).toBe(before);
  });

  it("still notices when the store is emptied underneath a cached ready", async () => {
    // Another tab signed out. A cache that believed itself would encrypt
    // with a key that is no longer there.
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    await confirmRecovery(USER, supa);
    await encryptionState(USER, supa);

    await forgetAllIdentities();
    expect((await encryptionState(USER, supa)).state).toBe("device-locked");
  });
});

// ── enrolling ──────────────────────────────────────────────────────────

describe("enroll", () => {
  it("makes one vault and hands back the code", async () => {
    const { supa, fake } = world();
    const r = await enroll(USER, null, supa);
    expect(r.ok).toBe(true);
    expect(fake.rows.size).toBe(1);
  });

  it("never makes a second identity for someone who has one", async () => {
    const { supa, fake } = world();
    await enroll(USER, null, supa);
    const before = { ...fake.rows.get(USER)! };

    expect(await enroll(USER, null, supa)).toEqual({ ok: false, reason: "exists" });
    expect(fake.rows.get(USER)).toEqual(before);
  });

  it("does not answer a locked device by creating another vault", async () => {
    // The second-phone case. The account has a vault; this phone does not
    // hold it. Making a fresh one would split one person into two identities
    // and strand everything sent to the first.
    const { supa, fake } = world();
    await enroll(USER, null, supa);
    const before = { ...fake.rows.get(USER)! };
    await forgetAllIdentities();
    forgetEncryptionState();

    expect(await enroll(USER, null, supa)).toEqual({ ok: false, reason: "exists" });
    expect(fake.rows.get(USER)).toEqual(before);
    expect(await isUnlocked(USER)).toBe(false);
  });

  it("lets exactly one of two simultaneous enrollments win", async () => {
    // Two tabs, opened together. No lock API exists in this environment, so
    // this exercises the database guard — the one that holds regardless.
    const { supa, fake } = world();
    const results = await Promise.all([enroll(USER, null, supa), enroll(USER, null, supa)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(fake.rows.size).toBe(1);
    // And the device holds the winner's identity, not a discarded one.
    expect(await boxOf(USER)).toBe(fake.rows.get(USER)!.identity_pub);
  });

  it("does not create anything when the server cannot be reached", async () => {
    const { supa, fake } = world();
    fake.signOut();
    expect(await enroll(USER, null, supa)).toEqual({ ok: false, reason: "failed" });
    expect(fake.rows.size).toBe(0);
    expect(await isUnlocked(USER)).toBe(false);
  });
});

// ── nothing counts until the code is confirmed ─────────────────────────

describe("the confirmation gate", () => {
  it("hides an unconfirmed vault from everyone who might encrypt to it", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, null, supa);

    fake.as(OTHER);
    expect((await fetchPublicKeys([USER], supa)).has(USER)).toBe(false);
  });

  it("shows it the moment its owner confirms", async () => {
    const { supa, fake } = world();
    const made = await setupIdentity(USER, null, supa);
    if (!made.ok) throw new Error("setup failed");
    await confirmRecovery(USER, supa);

    fake.as(OTHER);
    const keys = await fetchPublicKeys([USER], supa);
    expect(toB64(keys.get(USER)!.boxPub)).toBe(toB64(made.identity.boxPub));
  });

  it("keeps the first confirmation if it is confirmed again", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, null, supa);
    await confirmRecovery(USER, supa);
    const first = fake.rows.get(USER)!.rc_confirmed_at;
    await confirmRecovery(USER, supa);
    expect(fake.rows.get(USER)!.rc_confirmed_at).toBe(first);
  });

  it("cannot confirm a vault that does not exist", async () => {
    const { supa } = world();
    expect(await confirmRecovery(USER, supa)).toBe(false);
  });
});

// ── setup interrupted before the code was confirmed ────────────────────

describe("an interrupted setup", () => {
  it("is still pending after a reload — the code that was shown is gone", async () => {
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    forgetEncryptionState(); // a reload

    expect((await encryptionState(USER, supa)).state).toBe("recovery-pending");
  });

  it("issues a new code, and the one that was lost stops working", async () => {
    // Safe only because nothing was encrypted under an unconfirmed vault, so
    // there is no history the first code was protecting.
    const { supa } = world();
    const made = await setupIdentity(USER, null, supa);
    if (!made.ok) throw new Error("setup failed");

    const fresh = await reissueRecoveryCode(USER, supa);
    expect(fresh).not.toBeNull();
    expect(fresh).not.toBe(made.recoveryCode);

    await forgetAllIdentities();
    expect(await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa)).toEqual({
      ok: false,
      reason: "wrong-secret",
    });
    const opened = await unlock(USER, { kind: "recovery", secret: fresh! }, supa);
    expect(opened.ok).toBe(true);
    expect(await boxOf(USER)).toBe(toB64(made.identity.boxPub));
  });

  it("finishes: pending, then a new code, then confirmed, then ready", async () => {
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    forgetEncryptionState();

    expect((await encryptionState(USER, supa)).state).toBe("recovery-pending");
    expect(await reissueRecoveryCode(USER, supa)).not.toBeNull();
    expect(await confirmRecovery(USER, supa)).toBe(true);
    expect((await encryptionState(USER, supa)).state).toBe("ready");
  });

  it("cannot issue a code from a device that never held the master key", async () => {
    const { supa } = world();
    const made = await setupIdentity(USER, null, supa);
    if (!made.ok) throw new Error("setup failed");
    // An older device: the seed, but not the master key.
    const seed = (await loadSeed(USER))!;
    await forgetAllIdentities();
    await saveIdentity(USER, seed);

    expect(await reissueRecoveryCode(USER, supa)).toBeNull();
  });
});

// ── signing in with a password afterwards ──────────────────────────────

describe("ensureEncryption at a password sign-in", () => {
  it("adds a password wrapper to a vault that never had one", async () => {
    // Enrolled through Google; later types a password on the same device.
    const { supa, fake } = world();
    await setupIdentity(USER, null, supa);
    await confirmRecovery(USER, supa);
    expect(fake.rows.get(USER)!.mk_wrapped_pw).toBeNull();

    expect((await ensureEncryption(USER, PW, supa)).state).toBe("ready");
    expect(fake.rows.get(USER)!.mk_wrapped_pw).not.toBeNull();

    // A second phone now opens with nothing but that password.
    await forgetAllIdentities();
    forgetEncryptionState();
    const opened = await unlock(USER, { kind: "password", secret: PW }, supa);
    expect(opened.ok).toBe(true);
  });

  it("does not answer a password-less vault on a locked device by making a new one", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, null, supa);
    await confirmRecovery(USER, supa);
    const before = { ...fake.rows.get(USER)! };
    await forgetAllIdentities();
    forgetEncryptionState();

    expect(await ensureEncryption(USER, PW, supa)).toEqual({ state: "needs-recovery" });
    expect(fake.rows.get(USER)).toEqual(before);
    expect(await isUnlocked(USER)).toBe(false);
  });

  it("shows a fresh code again when setup was never finished", async () => {
    const { supa } = world();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) throw new Error("setup failed");
    forgetEncryptionState();

    const r = await ensureEncryption(USER, PW, supa);
    expect(r.state).toBe("created");
    if (r.state !== "created") return;
    expect(r.recoveryCode).not.toBe(made.recoveryCode);
  });

  it("recovers the master key once for a device enrolled before it was kept", async () => {
    // A seed but no master key: how every device looked before enrollment
    // became universal.
    const { supa } = world();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) throw new Error("setup failed");
    await confirmRecovery(USER, supa);

    const seed = (await loadSeed(USER))!;
    await forgetAllIdentities();
    await saveIdentity(USER, seed); // no master key
    forgetEncryptionState();
    expect(await loadMasterKey(USER)).toBeNull();

    expect((await ensureEncryption(USER, PW, supa)).state).toBe("ready");
    expect(await loadMasterKey(USER)).not.toBeNull();
  });

  it("writes nothing when there is nothing to add", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, PW, supa);
    await confirmRecovery(USER, supa);
    const before = fake.writes().length;

    await ensureEncryption(USER, PW, supa);
    expect(fake.writes().length).toBe(before);
  });
});

// ── changing and resetting a password ──────────────────────────────────

describe("after a password change — the old one is known", () => {
  it("re-wraps from the device's own master key; the identity and the code are untouched", async () => {
    const { supa } = world();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) throw new Error("setup failed");

    expect(await afterPasswordChange(USER, PW, "a brand new password", supa)).toBe("rewrapped");

    await forgetAllIdentities();
    expect((await unlock(USER, { kind: "password", secret: "a brand new password" }, supa)).ok).toBe(true);
    expect(await boxOf(USER)).toBe(toB64(made.identity.boxPub));

    await forgetAllIdentities();
    expect((await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa)).ok).toBe(true);
  });

  it("stops the old password working", async () => {
    const { supa } = world();
    await setupIdentity(USER, PW, supa);
    await afterPasswordChange(USER, PW, "a brand new password", supa);

    await forgetAllIdentities();
    expect(await unlock(USER, { kind: "password", secret: PW }, supa)).toEqual({
      ok: false,
      reason: "wrong-secret",
    });
  });

  it("falls back to the old password on a device without the master key", async () => {
    const { supa } = world();
    await setupIdentity(USER, PW, supa);
    const seed = (await loadSeed(USER))!;
    await forgetAllIdentities();
    await saveIdentity(USER, seed); // no master key

    expect(await afterPasswordChange(USER, PW, "another one", supa)).toBe("rewrapped");
    await forgetAllIdentities();
    expect((await unlock(USER, { kind: "password", secret: "another one" }, supa)).ok).toBe(true);
  });

  it("fails cleanly when it has neither the key nor the right old password", async () => {
    const { supa } = world();
    await setupIdentity(USER, PW, supa);
    const seed = (await loadSeed(USER))!;
    await forgetAllIdentities();
    await saveIdentity(USER, seed);

    expect(await afterPasswordChange(USER, "not the old one", "new", supa)).toBe("failed");
  });

  it("does nothing for an account with no vault", async () => {
    const { supa, fake } = world();
    expect(await afterPasswordChange(USER, PW, "new", supa)).toBe("none");
    expect(fake.writes()).toEqual([]);
  });
});

describe("after a password reset — the old one is unknown", () => {
  it("re-wraps from the device when it still holds the master key", async () => {
    // Password forgotten, reset from the same unlocked device. Costs nothing.
    const { supa } = world();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) throw new Error("setup failed");

    expect(await afterPasswordReset(USER, "the one set at reset", supa)).toBe("rewrapped");
    await forgetAllIdentities();
    const opened = await unlock(USER, { kind: "password", secret: "the one set at reset" }, supa);
    expect(opened.ok).toBe(true);
    expect(await boxOf(USER)).toBe(toB64(made.identity.boxPub));
  });

  it("drops the dead wrapper when no device holds the key, and says the code is now the way in", async () => {
    // Reset from a browser that never held the vault. The old password
    // wrapper opens nothing; offering it would only ever fail.
    const { supa, fake } = world();
    const made = await setupIdentity(USER, PW, supa);
    if (!made.ok) throw new Error("setup failed");
    await forgetAllIdentities();

    expect(await afterPasswordReset(USER, "the one set at reset", supa)).toBe("recovery-only");
    expect(fake.rows.get(USER)!.mk_wrapped_pw).toBeNull();
    expect(fake.rows.get(USER)!.salt_pw).toBeNull();
    // The recovery code is exactly as good as before, and reaches the same identity.
    const opened = await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa);
    expect(opened.ok).toBe(true);
    expect(await boxOf(USER)).toBe(toB64(made.identity.boxPub));
  });

  it("never regenerates the identity", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, PW, supa);
    const before = fake.rows.get(USER)!.identity_pub;
    await forgetAllIdentities();

    await afterPasswordReset(USER, "x", supa);
    expect(fake.rows.get(USER)!.identity_pub).toBe(before);
  });

  it("does nothing for an account with no vault", async () => {
    const { supa, fake } = world();
    expect(await afterPasswordReset(USER, "x", supa)).toBe("none");
    expect(fake.writes()).toEqual([]);
  });

  it("reports failure rather than guessing when the server cannot be reached", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, PW, supa);
    fake.signOut();
    expect(await afterPasswordReset(USER, "x", supa)).toBe("failed");
  });
});

// ── several accounts on one device, and a wiped one ────────────────────

describe("accounts and devices", () => {
  it("keeps two accounts on one device entirely separate", async () => {
    const { supa, fake } = world();
    await setupIdentity(USER, null, supa);
    await confirmRecovery(USER, supa);

    fake.as(OTHER);
    expect(await encryptionState(OTHER, supa)).toEqual({ state: "no-vault" });
    await setupIdentity(OTHER, null, supa);

    expect(await boxOf(USER)).not.toBe(await boxOf(OTHER));
    fake.as(USER);
    expect((await encryptionState(USER, supa)).state).toBe("ready");
    fake.as(OTHER);
    expect((await encryptionState(OTHER, supa)).state).toBe("recovery-pending");
  });

  it("brings a cleared browser back with the recovery code", async () => {
    const { supa } = world();
    const made = await setupIdentity(USER, null, supa);
    if (!made.ok) throw new Error("setup failed");
    await confirmRecovery(USER, supa);

    await forgetAllIdentities(); // site data cleared
    forgetEncryptionState();
    expect((await encryptionState(USER, supa)).state).toBe("device-locked");

    expect((await unlock(USER, { kind: "recovery", secret: made.recoveryCode }, supa)).ok).toBe(true);
    expect((await encryptionState(USER, supa)).state).toBe("ready");
    expect(await boxOf(USER)).toBe(toB64(made.identity.boxPub));
  });

  it("refuses a wrong recovery code and leaves the device locked", async () => {
    const { supa } = world();
    await setupIdentity(USER, null, supa);
    await forgetAllIdentities();

    expect(await unlock(USER, { kind: "recovery", secret: "AAAAA-BBBBB-CCCCC-DDDDD" }, supa)).toEqual({
      ok: false,
      reason: "wrong-secret",
    });
    expect(await isUnlocked(USER)).toBe(false);
  });

});
