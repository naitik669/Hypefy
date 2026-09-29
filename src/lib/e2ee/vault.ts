"use client";

import { createClient } from "@/lib/supabase/client";
import { fromB64, type Identity } from "@/lib/e2ee/crypto";
import {
  createVault,
  newRecoveryCode,
  openVault,
  rewrapForPassword,
  rewrapForRecovery,
  type KeyVault,
  type UnlockWith,
} from "@/lib/e2ee/keys";
import { forgetIdentity, loadIdentity, loadSeed, saveIdentity } from "@/lib/e2ee/store";

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
 */

/** Somebody's public halves — enough to write to them and to check a signature. */
export type PublicKeys = { boxPub: Uint8Array; signPub: Uint8Array };

type Supa = ReturnType<typeof createClient>;

/** The row for the signed-in user, or null if they have no identity yet. */
export async function fetchMyVault(supabase: Supa = createClient()): Promise<KeyVault | null> {
  const { data, error } = await supabase
    .from("user_keys")
    .select("identity_pub, signing_pub, seed_wrapped, mk_wrapped_pw, salt_pw, mk_wrapped_rc, salt_rc")
    .maybeSingle();
  if (error || !data) return null;
  return data as KeyVault;
}

/**
 * Public keys for a set of people.
 *
 * Through the definer function rather than the table: RLS hides other
 * people's rows entirely, which it must, since the same row holds their
 * wrapped seed.
 *
 * Someone missing from the result has not set up encryption yet — that is an
 * ordinary state, not an error, and the caller decides what to do about it.
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

export type SetupResult =
  | { ok: true; identity: Identity; recoveryCode: string }
  /** Someone already has an identity — unlock it instead of making another. */
  | { ok: false; reason: "exists" }
  | { ok: false; reason: "failed" };

/**
 * Make this account's identity, once.
 *
 * The recovery code comes back exactly here and nowhere else. It is never
 * stored anywhere we can read, so if the screen does not show it to the
 * person now, it is gone.
 */
export async function setupIdentity(
  userId: string,
  password: string,
  supabase: Supa = createClient(),
): Promise<SetupResult> {
  const recoveryCode = newRecoveryCode();
  const { vault, identity, seed } = createVault(password, recoveryCode);

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

  await saveIdentity(userId, seed);
  return { ok: true, identity, recoveryCode };
}

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

  await saveIdentity(userId, opened.seed);
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

/**
 * Move the password-wrapped copy onto a new password.
 *
 * Needs a secret that already opens the vault, because the master key can
 * only come back out the way it went in. Called after a password *change*,
 * where the old one is known.
 *
 * A password *reset* cannot use this — it does not know the old password.
 * That path unlocks with the recovery code first, then calls this with it.
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
 * Issue a fresh recovery code, retiring the old one.
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
}

/** Whether this device can decrypt for that account right now. */
export async function isUnlocked(userId: string): Promise<boolean> {
  return (await loadSeed(userId)) !== null;
}
