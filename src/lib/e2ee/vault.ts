"use client";

import { createClient } from "@/lib/supabase/client";
import { fromB64, identityFromSeed, toB64, type Identity } from "@/lib/e2ee/crypto";
import {
  createVault,
  newRecoveryCode,
  openVault,
  recoverMasterKey,
  rewrapForPassword,
  rewrapForRecovery,
  wrapForPassword,
  wrapForRecovery,
  type KeyVault,
  type UnlockWith,
} from "@/lib/e2ee/keys";
import {
  forgetIdentity,
  loadIdentity,
  loadMasterKey,
  loadSeed,
  saveIdentity,
} from "@/lib/e2ee/store";

/**
 * The glue: the key lifecycle talking to Supabase and to this device.
 *
 * keys.ts does the arithmetic and knows nothing about the network; store.ts
 * knows about the device and nothing about arithmetic. This joins them, and
 * is the only file a screen should need to import.
 *
 * Everything returns a result rather than throwing. Setting up encryption is
 * something a person does while trying to send a message; a thrown error
 * here would take the chat screen down with it.
 *
 * Signing in and being able to read your messages are separate facts, and
 * this file keeps them separate. Being authenticated says who you are.
 * Whether *this device* holds your keys, and whether the vault has a
 * recovery route its owner has actually seen, are answered by
 * `encryptionState` and by nothing else.
 */

/** Somebody's public halves — enough to write to them and to check a signature. */
export type PublicKeys = { boxPub: Uint8Array; signPub: Uint8Array };

type Supa = ReturnType<typeof createClient>;

/**
 * Fired on `window` whenever this account's encryption state changes: set
 * up, confirmed, unlocked or locked.
 *
 * The screens that show that state (a thread's composer, the inbox) are not
 * the screens that change it — a setup sheet lives in the app shell — so
 * they cannot be told directly. Without this, finishing setup would leave
 * every open thread still saying it was not encrypted.
 */
export const E2EE_CHANGED = "hypefy:e2ee-changed";

function announceChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(E2EE_CHANGED));
}

const VAULT_COLUMNS =
  "identity_pub, signing_pub, seed_wrapped, mk_wrapped_pw, salt_pw, mk_wrapped_rc, salt_rc, rc_confirmed_at";

/**
 * The row for the signed-in user — or a plain "could not tell".
 *
 * The distinction matters. "There is no vault" leads to making one; "the
 * request failed" must never lead there, or a dropped connection would look
 * exactly like a new account.
 */
export type VaultRead = { ok: true; vault: KeyVault | null } | { ok: false };

export async function readMyVault(supabase: Supa = createClient()): Promise<VaultRead> {
  const { data, error } = await supabase.from("user_keys").select(VAULT_COLUMNS).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, vault: (data as KeyVault | null) ?? null };
}

/** The row for the signed-in user, or null if there is none or it could not be read. */
export async function fetchMyVault(supabase: Supa = createClient()): Promise<KeyVault | null> {
  const read = await readMyVault(supabase);
  return read.ok ? read.vault : null;
}

/**
 * Public keys for a set of people.
 *
 * Through the definer function rather than the table: RLS hides other
 * people's rows entirely, which it must, since the same row holds their
 * wrapped seed.
 *
 * Someone missing from the result either has not set up encryption or has
 * not yet confirmed their recovery code — the server answers both the same
 * way on purpose, so "has keys" and "is safe to encrypt to" cannot drift
 * apart. The caller decides what to do about it.
 */
export async function fetchPublicKeys(
  userIds: string[],
  supabase: Supa = createClient(),
): Promise<Map<string, PublicKeys>> {
  const out = new Map<string, PublicKeys>();
  if (userIds.length === 0) return out;

  const { data, error } = await supabase.rpc("public_keys", { p_user_ids: userIds });
  if (error || !data) return out;

  for (const row of data) {
    try {
      out.set(row.user_id, {
        boxPub: fromB64(row.identity_pub),
        signPub: fromB64(row.signing_pub),
      });
    } catch {
      // A row that will not decode is a row we cannot message under. Skip it
      // rather than failing the whole lookup for everyone else.
    }
  }
  return out;
}

// ── where this account stands on this device ───────────────────────────

/**
 * The one answer to "can this person send an encrypted message right now?"
 *
 *   ready            this device holds the keys and the recovery code was
 *                    confirmed. The only state that encrypts.
 *   recovery-pending this device holds the keys but nobody has confirmed the
 *                    recovery code. Nothing may rely on the vault yet — a
 *                    cleared browser here would lose everything with no way
 *                    back.
 *   device-locked    a vault exists and this device cannot open it. Never
 *                    answered by making another vault: that would split one
 *                    person into two identities.
 *   no-vault         nothing exists. Enrolling is safe.
 *   unavailable      could not tell. Not the same as no-vault.
 */
export type EncryptionState =
  | { state: "ready" }
  | { state: "recovery-pending" }
  | { state: "device-locked"; canUsePassword: boolean }
  | { state: "no-vault" }
  | { state: "unavailable" };

/**
 * Accounts already known to be ready in this tab.
 *
 * A ready device asks nothing of the network again: no round trip, no key
 * derivation. Only the cheap local read is repeated, because another tab or
 * a sign-out can empty the store underneath us.
 */
const readyInThisTab = new Set<string>();

/** Forget what this tab believes about an account. */
export function forgetEncryptionState(userId?: string): void {
  if (userId) readyInThisTab.delete(userId);
  else readyInThisTab.clear();
}

export async function encryptionState(
  userId: string,
  supabase: Supa = createClient(),
): Promise<EncryptionState> {
  try {
    const seed = await loadSeed(userId);

    if (seed && readyInThisTab.has(userId)) return { state: "ready" };

    const read = await readMyVault(supabase);
    if (!read.ok) return { state: "unavailable" };
    const { vault } = read;

    if (!vault) return { state: "no-vault" };

    // A seed on this device that is not the vault's seed is somebody else's
    // leftover — a deleted and recreated account, a corrupt row. Treating it
    // as unlocked would encrypt under a key nobody can answer.
    const mine = seed && toB64(identityFromSeed(seed).boxPub) === vault.identity_pub;
    if (!mine) return { state: "device-locked", canUsePassword: !!vault.mk_wrapped_pw };

    if (!vault.rc_confirmed_at) return { state: "recovery-pending" };

    readyInThisTab.add(userId);
    return { state: "ready" };
  } catch {
    return { state: "unavailable" };
  }
}

/**
 * Run `work` while no other tab of this browser is running anything under
 * the same name.
 *
 * Two tabs opening at once must not both decide there is no vault. The
 * database refuses the second insert regardless — `init_user_keys` will not
 * overwrite — but the loser would be left holding a discarded identity and,
 * with no password to fall back on, no way to reach the winner's.
 */
async function exclusive<T>(name: string, work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks || typeof locks.request !== "function") return work();
  return (await locks.request(name, work)) as T;
}

// ── making a vault ─────────────────────────────────────────────────────

export type SetupResult =
  | { ok: true; identity: Identity; recoveryCode: string }
  /** Someone already has an identity — unlock it instead of making another. */
  | { ok: false; reason: "exists" }
  | { ok: false; reason: "failed" };

/**
 * Make this account's identity, once.
 *
 * The password is optional: an account that signed in with Google or an
 * emailed code has none, and gets the same vault minus one wrapper.
 *
 * The recovery code comes back exactly here and nowhere else. It is never
 * stored anywhere we can read, so if the screen does not show it to the
 * person now, it is gone — which is why the vault it protects does not count
 * until they confirm it (see `confirmRecovery`).
 */
export async function setupIdentity(
  userId: string,
  password: string | null,
  supabase: Supa = createClient(),
): Promise<SetupResult> {
  const recoveryCode = newRecoveryCode();
  const { vault, identity, seed, masterKey } = createVault(password, recoveryCode);

  const { data, error } = await supabase.rpc("init_user_keys", {
    p_identity_pub: vault.identity_pub,
    p_signing_pub: vault.signing_pub,
    p_seed_wrapped: vault.seed_wrapped,
    p_mk_wrapped_pw: vault.mk_wrapped_pw,
    p_salt_pw: vault.salt_pw,
    p_mk_wrapped_rc: vault.mk_wrapped_rc,
    p_salt_rc: vault.salt_rc,
  });

  if (error) return { ok: false, reason: "failed" };
  // false means a row was already there. The identity we just generated is
  // not theirs and must be thrown away — writing it locally would leave this
  // device unable to read anything it receives.
  if (data !== true) return { ok: false, reason: "exists" };

  await saveIdentity(userId, seed, masterKey);
  announceChange();
  return { ok: true, identity, recoveryCode };
}

/**
 * Enroll this account, safely, from any entry point.
 *
 * Re-reads the state inside the lock, so whichever of two tabs arrives second
 * finds the first one's vault and stops.
 */
export async function enroll(
  userId: string,
  password: string | null,
  supabase: Supa = createClient(),
): Promise<SetupResult> {
  return exclusive(`hypefy-e2ee-enroll-${userId}`, async () => {
    const now = await encryptionState(userId, supabase);
    if (now.state === "unavailable") return { ok: false, reason: "failed" } as const;
    if (now.state !== "no-vault") return { ok: false, reason: "exists" } as const;
    return setupIdentity(userId, password, supabase);
  });
}

/**
 * A fresh recovery code for a vault this device holds.
 *
 * For the case where setup was interrupted between making the vault and
 * confirming the code — the first code is gone with the screen it was on, and
 * since nothing was ever encrypted under an unconfirmed vault, replacing it
 * loses nothing. Also how a confirmed code is replaced once spent.
 *
 * Needs the master key, which a device enrolled through this flow always has.
 * Null when it does not — an older device, which is only ever in this
 * situation if its vault was confirmed already.
 */
export async function reissueRecoveryCode(
  userId: string,
  supabase: Supa = createClient(),
): Promise<string | null> {
  const masterKey = await loadMasterKey(userId);
  if (!masterKey) return null;

  const code = newRecoveryCode();
  const next = wrapForRecovery(masterKey, code);
  const { error } = await supabase.rpc("rewrap_recovery", {
    p_mk_wrapped_rc: next.mk_wrapped_rc,
    p_salt_rc: next.salt_rc,
  });
  return error ? null : code;
}

/**
 * The owner has seen and kept the recovery code.
 *
 * The moment encryption becomes real: from here the server starts handing out
 * this account's public keys, so other people can start encrypting to it.
 */
export async function confirmRecovery(
  userId: string,
  supabase: Supa = createClient(),
): Promise<boolean> {
  const { error } = await supabase.rpc("confirm_recovery");
  if (error) return false;
  readyInThisTab.add(userId);
  announceChange();
  return true;
}

// ── signing in with a password ─────────────────────────────────────────

/**
 * What happened when we tried to make encryption ready.
 *
 * Every case is non-fatal on purpose. This runs while somebody is signing
 * in to use the app, and encryption failing is never a reason to stop them
 * getting to their feed.
 */
export type EnsureResult =
  /** Already usable on this device. The common case, and it does nothing. */
  | { state: "ready" }
  /** A recovery code exists ONLY here and has not been confirmed — show it,
   *  then call `confirmRecovery`. New vault, or an interrupted setup. */
  | { state: "created"; recoveryCode: string }
  /** Opened with the password they just typed. They saw nothing. */
  | { state: "unlocked" }
  /** The password does not open the vault — after a reset, or because the
   *  vault never had a password wrapper. The recovery code is the way in. */
  | { state: "needs-recovery" }
  /** Could not reach the server, or storage is unavailable. Carry on
   *  unencrypted rather than standing in the way. */
  | { state: "unavailable" };

/**
 * Make encryption ready, silently, at the moment a password is typed.
 *
 * Signing in with a password is one of several ways in, and the only one
 * where a plaintext secret exists in the browser — so it is the one place a
 * password wrapper can be created without asking for anything. Everything
 * else (Google, emailed codes, a session that never ended) enrolls through
 * `enroll` and the setup sheet instead. Neither path depends on the other.
 *
 * The password is used and dropped. It is not stored, and it never leaves
 * the browser except in Supabase's own sign-in call.
 */
export async function ensureEncryption(
  userId: string,
  password: string,
  supabase: Supa = createClient(),
): Promise<EnsureResult> {
  try {
    const current = await encryptionState(userId, supabase);

    switch (current.state) {
      case "unavailable":
        return { state: "unavailable" };

      case "no-vault": {
        const made = await enroll(userId, password, supabase);
        if (made.ok) return { state: "created", recoveryCode: made.recoveryCode };
        // "exists": another tab or device got there first. Try to open theirs.
        if (made.reason === "failed") return { state: "unavailable" };
        return ensureEncryption(userId, password, supabase);
      }

      case "device-locked": {
        if (!current.canUsePassword) return { state: "needs-recovery" };
        const opened = await unlock(userId, { kind: "password", secret: password }, supabase);
        if (!opened.ok) return { state: "needs-recovery" };
        await topUpPasswordWrapper(userId, password, supabase);
        return { state: "unlocked" };
      }

      case "recovery-pending": {
        // Setup was interrupted before the code was confirmed. The code that
        // was shown is unrecoverable, and nothing was encrypted under it, so
        // a new one costs nothing. Show it again.
        await topUpPasswordWrapper(userId, password, supabase);
        const code = await reissueRecoveryCode(userId, supabase);
        return code ? { state: "created", recoveryCode: code } : { state: "ready" };
      }

      case "ready":
        await topUpPasswordWrapper(userId, password, supabase);
        return { state: "ready" };
    }
  } catch {
    return { state: "unavailable" };
  }
}

/**
 * Make sure this password opens the vault, when it cheaply can be.
 *
 * Only ever adds: it never touches a wrapper that already exists. That is
 * deliberate — proving an existing wrapper is current would cost a key
 * derivation on every sign-in, and a stale one is handled where it is caused
 * (`afterPasswordReset`).
 *
 * Two cases, both quiet:
 *  · the vault has no password wrapper (Google or emailed-code enrollment) —
 *    add one, using the master key this device already holds;
 *  · this device has the seed but never the master key (enrolled before the
 *    master key was kept) — recover it once, from the wrapper the password
 *    opens, so the device can re-wrap later without any old secret.
 */
async function topUpPasswordWrapper(
  userId: string,
  password: string,
  supabase: Supa,
): Promise<void> {
  const read = await readMyVault(supabase);
  if (!read.ok || !read.vault) return;
  const { vault } = read;

  let masterKey = await loadMasterKey(userId);

  if (!masterKey && vault.mk_wrapped_pw) {
    masterKey = recoverMasterKey(vault, { kind: "password", secret: password });
    const seed = await loadSeed(userId);
    if (masterKey && seed) await saveIdentity(userId, seed, masterKey);
  }

  if (masterKey && !vault.mk_wrapped_pw) {
    const next = wrapForPassword(masterKey, password);
    await supabase.rpc("rewrap_master_key", {
      p_mk_wrapped_pw: next.mk_wrapped_pw,
      p_salt_pw: next.salt_pw,
    });
  }
}

// ── unlocking ──────────────────────────────────────────────────────────

export type UnlockResult =
  | { ok: true; identity: Identity }
  /** The password or code was wrong — an ordinary event, say so plainly. */
  | { ok: false; reason: "wrong-secret" }
  /** No identity exists for this account yet. */
  | { ok: false; reason: "no-vault" };

/** Open this account's identity on this device and keep it here. */
export async function unlock(
  userId: string,
  secret: UnlockWith,
  supabase: Supa = createClient(),
): Promise<UnlockResult> {
  const vault = await fetchMyVault(supabase);
  if (!vault) return { ok: false, reason: "no-vault" };

  const opened = openVault(vault, secret);
  if (!opened) return { ok: false, reason: "wrong-secret" };

  await saveIdentity(userId, opened.seed, opened.masterKey);
  forgetEncryptionState(userId);
  announceChange();
  return { ok: true, identity: opened.identity };
}

/**
 * The identity already on this device, without asking for anything.
 *
 * Null means the person has to unlock. Callers on the sending path should
 * treat that as "cannot encrypt yet" rather than as a failure.
 */
export async function currentIdentity(userId: string): Promise<Identity | null> {
  return loadIdentity(userId);
}

// ── changing or losing a password ──────────────────────────────────────

/**
 * Move the password-wrapped copy onto a new password, given a secret that
 * already opens the vault.
 *
 * Used after a password *change*, where the old one is in hand. If this
 * device already holds the master key, `afterPasswordChange` is the simpler
 * way in.
 */
export async function rewrapPassword(
  current: UnlockWith,
  newPassword: string,
  supabase: Supa = createClient(),
): Promise<boolean> {
  const vault = await fetchMyVault(supabase);
  if (!vault) return false;

  const next = rewrapForPassword(vault, current, newPassword);
  if (!next) return false;

  const { error } = await supabase.rpc("rewrap_master_key", {
    p_mk_wrapped_pw: next.mk_wrapped_pw,
    p_salt_pw: next.salt_pw,
  });
  return !error;
}

/**
 * The password was changed and the old one is known.
 *
 * Prefers the master key this device already holds, so nothing has to be
 * derived; falls back to opening the vault with the old password.
 *
 * Returns whether the new password now opens the vault. False is not fatal —
 * the recovery code is untouched — but the caller should say so.
 */
export async function afterPasswordChange(
  userId: string,
  oldPassword: string,
  newPassword: string,
  supabase: Supa = createClient(),
): Promise<"none" | "rewrapped" | "failed"> {
  const read = await readMyVault(supabase);
  if (!read.ok) return "failed";
  if (!read.vault) return "none";

  const masterKey =
    (await loadMasterKey(userId)) ??
    recoverMasterKey(read.vault, { kind: "password", secret: oldPassword });
  if (!masterKey) return "failed";

  const next = wrapForPassword(masterKey, newPassword);
  const { error } = await supabase.rpc("rewrap_master_key", {
    p_mk_wrapped_pw: next.mk_wrapped_pw,
    p_salt_pw: next.salt_pw,
  });
  return error ? "failed" : "rewrapped";
}

/**
 * The password was reset, and the old one is unknown.
 *
 *   this device holds the master key  → re-wrap under the new password.
 *                                       Nothing is lost, nothing is asked.
 *   it does not                       → the password wrapper is now a dead
 *                                       end, so drop it. The recovery code is
 *                                       the way in, and the caller must say
 *                                       so plainly.
 *   no vault at all                   → nothing to do.
 *
 * Never regenerates anything. The identity is exactly what it was.
 */
export async function afterPasswordReset(
  userId: string,
  newPassword: string,
  supabase: Supa = createClient(),
): Promise<"none" | "rewrapped" | "recovery-only" | "failed"> {
  const read = await readMyVault(supabase);
  if (!read.ok) return "failed";
  if (!read.vault) return "none";

  const masterKey = await loadMasterKey(userId);
  if (masterKey) {
    const next = wrapForPassword(masterKey, newPassword);
    const { error } = await supabase.rpc("rewrap_master_key", {
      p_mk_wrapped_pw: next.mk_wrapped_pw,
      p_salt_pw: next.salt_pw,
    });
    return error ? "failed" : "rewrapped";
  }

  const { error } = await supabase.rpc("drop_password_wrapper");
  return error ? "failed" : "recovery-only";
}

/**
 * Issue a fresh recovery code, retiring the old one, given a secret that
 * already opens the vault.
 *
 * Returns the new code, which — like the first one — exists only in this
 * return value.
 */
export async function regenerateRecoveryCode(
  current: UnlockWith,
  supabase: Supa = createClient(),
): Promise<string | null> {
  const vault = await fetchMyVault(supabase);
  if (!vault) return null;

  const code = newRecoveryCode();
  const next = rewrapForRecovery(vault, current, code);
  if (!next) return null;

  const { error } = await supabase.rpc("rewrap_recovery", {
    p_mk_wrapped_rc: next.mk_wrapped_rc,
    p_salt_rc: next.salt_rc,
  });
  return error ? null : code;
}

/**
 * Lock this device for that account.
 *
 * Only the local copy goes; the vault stays, so they can unlock again. Call
 * this when an account is removed from the switcher as well as on sign-out —
 * a "forgotten" account should not still be readable here.
 */
export async function lockDevice(userId: string): Promise<void> {
  await forgetIdentity(userId);
  forgetEncryptionState(userId);
  announceChange();
}

/** Whether this device can decrypt for that account right now. */
export async function isUnlocked(userId: string): Promise<boolean> {
  return (await loadSeed(userId)) !== null;
}
