/**
 * The life of a person's encryption identity: made once, locked with two
 * different secrets, unlocked again on whatever device they sign in on.
 *
 * Pure with respect to the network — every function here takes bytes and
 * returns bytes. The Supabase calls live in vault.ts, so the arithmetic that
 * has to be right can be tested without a database.
 *
 * The shape, and why:
 *
 *   seed          32 random bytes. Both keypairs come from it, so this is
 *                 the only thing that must survive for history to survive.
 *   master key    32 random bytes. Encrypts the seed.
 *   two wraps     the master key, encrypted twice — once under a key derived
 *                 from the password, once under a key derived from a
 *                 recovery code.
 *
 * Wrapping the master key twice rather than the seed twice is what makes a
 * password change cheap: 32 bytes are re-encrypted and the recovery code
 * still works, because both routes end at the same master key.
 */

import {
  KEY_BYTES,
  SALT_BYTES,
  deriveKek,
  fromB64,
  identityFromSeed,
  newSeed,
  randomBytes,
  toB64,
  unwrap,
  wrap,
  type Identity,
} from "@/lib/e2ee/crypto";

/** Exactly the columns `user_keys` holds, all base64. */
export type KeyVault = {
  identity_pub: string;
  signing_pub: string;
  seed_wrapped: string;
  mk_wrapped_pw: string;
  salt_pw: string;
  mk_wrapped_rc: string;
  salt_rc: string;
};

/** How many characters a recovery code has, excluding its dashes. */
const CODE_CHARS = 20;
/** Crockford base32 without I, L, O or U — no character can be misread as
 *  another when someone writes it on paper and types it back a year later. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A recovery code, grouped for reading aloud.
 *
 * 20 characters from a 32-letter alphabet is 100 bits — far past anything
 * that could be guessed, and the thing standing between a forgotten password
 * and a permanently unreadable history.
 */
export function newRecoveryCode(): string {
  const bytes = randomBytes(CODE_CHARS);
  // Rejection-free: 256 is not a multiple of 32, but 32 divides 256 exactly
  // eight times, so a plain modulo is uniform here.
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return (chars.match(/.{1,5}/g) ?? []).join("-");
}

/**
 * What the user typed, in the form the code was generated in.
 *
 * People type spaces, lower case, and the letter O for zero. None of that
 * should be the difference between recovering a history and losing it.
 */
export function normaliseRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/**
 * Make an identity, and lock it with both secrets.
 *
 * Returns the vault to store and the identity to use right now, so first
 * setup does not have to immediately unwrap what it just wrapped.
 */
export function createVault(
  password: string,
  recoveryCode: string,
): { vault: KeyVault; identity: Identity; seed: Uint8Array } {
  const seed = newSeed();
  const identity = identityFromSeed(seed);
  const masterKey = randomBytes(KEY_BYTES);

  const saltPw = randomBytes(SALT_BYTES);
  const saltRc = randomBytes(SALT_BYTES);

  return {
    seed,
    identity,
    vault: {
      identity_pub: toB64(identity.boxPub),
      signing_pub: toB64(identity.signPub),
      seed_wrapped: toB64(wrap(seed, masterKey)),
      mk_wrapped_pw: toB64(wrap(masterKey, deriveKek(password, saltPw))),
      salt_pw: toB64(saltPw),
      mk_wrapped_rc: toB64(wrap(masterKey, deriveKek(normaliseRecoveryCode(recoveryCode), saltRc))),
      salt_rc: toB64(saltRc),
    },
  };
}

/** Which secret is being offered. */
export type UnlockWith = { kind: "password"; secret: string } | { kind: "recovery"; secret: string };

/**
 * Open a vault.
 *
 * Null for a wrong secret — that is an ordinary event, not an exception, and
 * the caller needs to tell it apart from a genuine failure so it can say
 * "that password is wrong" rather than "something went wrong".
 */
export function openVault(vault: KeyVault, with_: UnlockWith): { identity: Identity; seed: Uint8Array } | null {
  const secret = with_.kind === "recovery" ? normaliseRecoveryCode(with_.secret) : with_.secret;
  const salt = fromB64(with_.kind === "recovery" ? vault.salt_rc : vault.salt_pw);
  const wrapped = fromB64(with_.kind === "recovery" ? vault.mk_wrapped_rc : vault.mk_wrapped_pw);

  const masterKey = unwrap(wrapped, deriveKek(secret, salt));
  if (!masterKey) return null;

  const seed = unwrap(fromB64(vault.seed_wrapped), masterKey);
  if (!seed) return null;

  const identity = identityFromSeed(seed);
  // The vault says which identity it holds. If the seed we just recovered
  // produces a different one, something is wrong with the row — refuse
  // rather than silently messaging under a key nobody can answer.
  if (toB64(identity.boxPub) !== vault.identity_pub) return null;

  return { identity, seed };
}

/**
 * The same master key, locked under a new password.
 *
 * Needs the old secret, because the master key can only come out the way it
 * went in. A password *reset* — where the old one is unknown — cannot use
 * this, which is exactly why the recovery code exists.
 */
export function rewrapForPassword(
  vault: KeyVault,
  currentSecret: UnlockWith,
  newPassword: string,
): { mk_wrapped_pw: string; salt_pw: string } | null {
  const masterKey = recoverMasterKey(vault, currentSecret);
  if (!masterKey) return null;
  const salt = randomBytes(SALT_BYTES);
  return {
    mk_wrapped_pw: toB64(wrap(masterKey, deriveKek(newPassword, salt))),
    salt_pw: toB64(salt),
  };
}

/** The same, for issuing a fresh recovery code after one has been spent. */
export function rewrapForRecovery(
  vault: KeyVault,
  currentSecret: UnlockWith,
  newCode: string,
): { mk_wrapped_rc: string; salt_rc: string } | null {
  const masterKey = recoverMasterKey(vault, currentSecret);
  if (!masterKey) return null;
  const salt = randomBytes(SALT_BYTES);
  return {
    mk_wrapped_rc: toB64(wrap(masterKey, deriveKek(normaliseRecoveryCode(newCode), salt))),
    salt_rc: toB64(salt),
  };
}

function recoverMasterKey(vault: KeyVault, with_: UnlockWith): Uint8Array | null {
  const secret = with_.kind === "recovery" ? normaliseRecoveryCode(with_.secret) : with_.secret;
  const salt = fromB64(with_.kind === "recovery" ? vault.salt_rc : vault.salt_pw);
  const wrapped = fromB64(with_.kind === "recovery" ? vault.mk_wrapped_rc : vault.mk_wrapped_pw);
  return unwrap(wrapped, deriveKek(secret, salt));
}
