# Universal E2EE enrollment — audit and plan

Written before any code changes. Sections 1–6 describe what existed then,
7–8 what was wrong with it, 9–13 the plan. **§14 records what was actually
built, where it differs from the plan, and what is still open.**

Status: implemented and pushed (`43df516`, `9a032d3`). Migration `0104` is
applied to production.

---

## 1. Architecture map (as built)

```
crypto.ts    bytes in, bytes out. X25519 · Ed25519 · XChaCha20-Poly1305 ·
             HKDF-SHA256 · Argon2id (t=2, m=19 MiB, p=1). No storage, no network.
   |
keys.ts      seed(32) --wrap--> under masterKey(32)
             masterKey --wrap--> under Argon2id(password, salt_pw)
             masterKey --wrap--> under Argon2id(recoveryCode, salt_rc)
             createVault / openVault / rewrapForPassword / rewrapForRecovery
   |
store.ts     IndexedDB `hypefy-e2ee` / `identities`, keyPath userId.
             Holds the 32-byte seed. Never throws.
   |
vault.ts     the glue: Supabase RPCs + store.ts. ensureEncryption() is the
             entry point the sign-in screen calls.
   |
message.ts   the envelope in `messages.body`:
             { v, boxes: { <recipientId>: {n,c}, <senderId>: {n,c} }, sig }
             Two sealed copies, both under the same `senderId|recipientId`
             AAD label. `sig` is Ed25519 over the plaintext prefixed with
             conversation and both parties.
   |
chat.ts      what a screen calls: useEnvelopeReader / sealFor / openEnvelope /
             openIncoming / canEncrypt / isEncrypted. Three outcomes:
             plain · open · locked.
   |
RealChatView · MessagesInbox · InAppNotifier
```

**Invariant that must not regress:** `storedMessages` holds exactly what the
server holds. `messages` is derived from it. Decryption happens in one
`useMemo`, not at render sites.

### What is genuinely provided

- Confidentiality of 1:1 **text** bodies against the database and anyone
  reading it, including us.
- Integrity and sender authentication per message (AEAD + Ed25519).
- Cross-device history for the sender, via the second sealed copy.
- Attributable reports, via the signature — a deliberate trade of
  deniability, documented in `message.ts`.

### What is not

- **No forward secrecy.** Keys are long-lived per user; there is no ratchet.
  One compromised seed reads that user's entire history.
- **No post-compromise security.** Nothing heals after a key leak.
- **No key-authenticity verification.** No safety numbers, no fingerprint
  comparison. See finding **F7**.
- Groups, media, attachments, voice notes, documents, GIFs, songs, page
  replies, reactions, system messages, calls, search — all plaintext.

This is **not** Signal-equivalent and must never be described as such.

---

## 2. Authentication flow map

| Route | Where | Plaintext password in the browser? | Vault created today? |
|---|---|---|---|
| Password sign-up | `AuthCard.tsx:262` | yes | **yes** |
| Password sign-in | `AuthCard.tsx:183` | yes | **yes** |
| Password sign-in, add-account | `AuthCard.tsx:192` | yes | **yes** |
| Google OAuth | `AuthCard.tsx:377` → `auth/callback/route.ts` | **never** | no |
| Email OTP / magic link | `AuthCard.tsx:305`, `Verify2StepCard.tsx:41` | **never** | no |
| Returning session (refresh token) | middleware / layout | no | no |
| Account switcher restore | `AccountSwitcher.tsx`, `AccountSwitchPad.tsx` | no | no |
| Password reset | `ResetPasswordCard.tsx:65` | new one only | no — and breaks the old wrapper |
| Password change | `AccountForms.tsx:88` | old **and** new | no — and breaks the old wrapper |

Only the three password rows reach `ensureEncryption`. Everything else — which
is most real traffic — never enrolls.

---

## 3. Vault lifecycle (today)

```
setupIdentity(userId, password)
  createVault(password, newRecoveryCode())
  init_user_keys(...)  -- on conflict do nothing; returns false if a row exists
  saveIdentity(userId, seed)        -- IndexedDB
  → RecoveryCodeScreen, confirmed by re-typing the last 5 characters
```

`ensureEncryption` short-circuits on `isUnlocked(userId)` and returns `ready`,
so an unlocked device never revisits the vault — which is why a missing
password wrapper can never be topped up.

`rewrapPassword` and `regenerateRecoveryCode` exist in `vault.ts` and are
**called from nowhere** (F12).

---

## 4. Device lifecycle (today)

- **Enrolled:** seed in IndexedDB under that userId.
- **Forgotten:** `forgetIdentity(userId)` on account removal from the
  switcher; `forgetAllIdentities()` on sign-out, account deletion, and
  "sign out other devices".
- **Second device:** no path at all. `ensureEncryption` on a password
  sign-in finds a vault, unlocks with the password, done. On a Google or OTP
  sign-in, nothing happens and the device stays locked forever with no UI
  that offers to unlock it.
- There is **no device table, no per-device key, no revocation**. One
  identity, copied to every device that manages to unlock it.

---

## 5. Message lifecycle (today)

```
send()  kind=text, 1:1, both parties have keys
   → sealFor → envelope → send_message(p_body = envelope)
   → optimistic copy keeps plaintext + `_cipher` for echo matching

arrival (SSR · pagination · catchUp · realtime INSERT)
   → storedMessages (envelope)
   → useMemo → openEnvelope → { plain | open | locked }
```

`send_message` needed no change: its only requirement of a body is
non-emptiness.

Legacy rows parse as `plain` and render exactly as before — correct, but
**unmarked**: nothing in the thread distinguishes "sent before encryption
existed" from "sent unencrypted just now" (F13).

---

## 6. Schema (`0103_user_keys.sql`)

```
user_keys
  user_id       uuid primary key → auth.users on delete cascade
  version       smallint not null default 1
  identity_pub  text not null          -- X25519 public, base64
  signing_pub   text not null          -- Ed25519 public, base64
  seed_wrapped  text not null          -- seed under masterKey
  mk_wrapped_pw text NOT NULL          -- masterKey under Argon2id(password)
  salt_pw       text NOT NULL
  mk_wrapped_rc text not null          -- masterKey under Argon2id(code)
  salt_rc       text not null
  created_at / updated_at
```

RLS: `select` where `auth.uid() = user_id`. `revoke all` then `grant select`
only — no insert/update/delete grant at all.

RPCs, all `security definer`, `search_path = public`, granted to
`authenticated` only, `revoke`d from `public`/`anon`:

| RPC | Writes | Guard |
|---|---|---|
| `public_keys(uuid[])` | — | returns only the two public columns |
| `init_user_keys(7×text)` | own row | `on conflict do nothing` → cannot overwrite an identity |
| `rewrap_master_key(2×text)` | own `mk_wrapped_pw`, `salt_pw` | `auth.uid()` only |
| `rewrap_recovery(2×text)` | own `mk_wrapped_rc`, `salt_rc` | `auth.uid()` only |

**Audit result: the server-visible surface is correct.** Every definer
function scopes to `auth.uid()`; none returns private material to anyone but
its owner; no privilege escalation path found; no way for user A to write
user B's keys. The `on conflict do nothing` in `init_user_keys` is the single
most important line in the file — it makes identity replacement impossible
through the API, including by a buggy client retrying setup.

---

## 7. Security findings

| # | Severity | Finding |
|---|---|---|
| **F1** | **HIGH** | `android:allowBackup="true"` in `AndroidManifest.xml`. The WebView's IndexedDB lives in app-private storage, which Android Auto Backup uploads to the user's Google Drive. **The identity seed leaves the device**, to a third party, silently. |
| **F2** | **HIGH** | Password *change* (`AccountForms.tsx:88`) never re-wraps. The old password wrapper is orphaned; the new password opens nothing. Both the old and the new password are in hand at that moment — this is a one-line fix that has never been wired. |
| **F3** | **HIGH** | Password *reset* (`ResetPasswordCard.tsx:65`) likewise. After a reset the only route in is the recovery code, and nothing tells the user that before or after. |
| **F4** | **HIGH** | "Sign out other devices" (`SessionsCard.tsx:46`) calls `forgetAllIdentities()`, wiping the key of the device the user is *currently sitting on and still signed into*. They must then recover — on the device they never left. |
| **F5** | **HIGH** | Nothing gates encryption on the recovery code having been *seen*. A vault can exist, messages can start relying on it, and the user may never have viewed the only backup route. Clearing site data then loses history permanently. |
| **F6** | **MEDIUM** | Enrollment is reachable only from the three password paths. Google, OTP, magic-link, returning-session and switched-account users never enroll. (The reported problem.) |
| **F7** | **MEDIUM** | **No key-authenticity verification.** `public_keys` is trusted absolutely. A compromised server, or anyone with service-role access, can replace `identity_pub`/`signing_pub` for a target and read everything sent afterwards. There are no safety numbers, no key-change warning, no pinning. This is inherent to the current design, not a bug in it — but it means the honest claim is *"we do not read your messages"*, not *"we could not"*. |
| **F8** | **MEDIUM** | `mk_wrapped_pw NOT NULL` makes a password structurally mandatory for a vault that should be authentication-agnostic. |
| **F9** | **LOW** | `rewrap_master_key` / `rewrap_recovery` do not verify the new wrapper holds the same master key. A buggy client can brick one of its own routes. Self-harm only; the other wrapper survives. |
| **F10** | **LOW** | Two tabs enrolling at once: the loser of `init_user_keys` gets `false` and, with no password, has no way to reach the master key. Needs single-flight. |
| **F11** | **LOW** | `public_keys` lets any authenticated user test whether a given uuid has enrolled. Minor enumeration surface; public keys are public by design. |
| **F12** | **LOW** | `rewrapPassword` and `regenerateRecoveryCode` are dead code — no caller. |
| **F13** | **LOW** | Legacy plaintext messages are unmarked in the UI. |

---

## 8. Existing-user migration risks

1. **Irreversible key loss.** Any design that creates a vault, starts
   encrypting, and only later shows the recovery code will permanently lose
   history for every user who clears site data in between. **This is the risk
   that decides the design** — hence the `RECOVERY_CONFIRMED` gate in §9.
2. **Identity fragmentation.** If a second device enrolls by *creating* a new
   vault rather than unlocking the existing one, the user ends up with two
   identities, and messages sent to the old key become unreadable. Prevented
   today by `on conflict do nothing`; must stay prevented as the client grows
   more enrollment entry points.
3. **Half-enrolled peers.** If A is enrolled and B has a vault but has never
   confirmed a recovery code, A encrypting to B produces messages B may lose.
   Solved by making key discovery itself conditional on confirmation (§9).
4. **Rollout cliff.** On the day this ships, nearly every peer is
   unenrolled, so nearly every DM is plaintext with a notice. That is
   correct and honest, but it means the notice must read as informative
   rather than as an error.
5. **Prompt fatigue.** One setup sheet per account, ever. A user who
   dismisses it must not see it again on the next navigation.

---

## 9. Recommended state machine

Two orthogonal facts, and every state is a combination of them: does *this
device* hold the seed, and does the *account* have a confirmed vault.

```
                         AUTHENTICATED
                               |
                    CHECK_ENCRYPTION_STATE
        (1 IndexedDB read; 1 user_keys row, cached per tab)
                               |
   +---------------------------+---------------------------+
   |                           |                           |
device has seed          no seed, vault exists        no seed, no vault
   |                           |                           |
   v                           v                           v
rc_confirmed?          VAULT_EXISTS_DEVICE_LOCKED        NO_VAULT
   |     \                     |                           |
  yes     no                   | unlock with:              | create locally:
   |       \                   |  · password (if a pw      |  seed, masterKey,
   v        v                  |    wrapper exists)        |  recoveryCode
E2EE_READY  RECOVERY_PENDING   |  · recovery code          |  wrap MK under rc
            (show the code,    |  · [future] device        |  (and under pw iff
             then confirm)     |    transfer               |   one is in hand)
                               |                           |
                               +------------+--------------+
                                            |
                                            v
                                     RECOVERY_PENDING
                                            |
                                    user confirms code
                                            |
                                            v
                                       E2EE_READY
```

Rules that make this safe:

- **`E2EE_READY` is the only state in which `sealFor` returns an envelope.**
  Vault existence alone never activates encryption.
- **`public_keys` returns a row only for confirmed vaults.** So "the peer has
  keys" and "the peer is E2EE-ready" become the same statement, enforced in
  one place, server-side. No client can encrypt to someone who has not
  secured a recovery route.
- **Never create a second vault.** `NO_VAULT` is established by reading the
  row; `init_user_keys` returning `false` means someone else won the race and
  the client re-reads instead of retrying.
- **Password is a wrapper, never the foundation.** The master key is random
  and stays random. A password can be added, replaced or absent.
- **Any unlocked device can mint a new wrapper**, because the device will now
  hold the master key alongside the seed (§11). This is what makes password
  reset survivable and what lets a Google user later add a password.

---

## 10. Recommended UX

**Never blocks the app.** Home, Discover, profiles, public content are
untouched. Encryption state is a property of the messaging surface only.

**First run, unenrolled** — a sheet, not a page, shown once per account:

> **Protect your private conversations**
> Your messages can be encrypted so only you and the person you're talking to
> can read them. Not even Hypefy.
> [ Set up ]   [ Not now ]

**After setup** — the existing `RecoveryCodeScreen`, with copy that states the
consequence plainly:

> If you lose this device and this code, your encrypted messages cannot be
> recovered by anyone, including us.

Confirmation stays as it is: re-type the last five characters. That friction
is placed exactly where the loss becomes permanent, and it is the thing that
flips `RECOVERY_CONFIRMED`.

**Second device** — no nag at sign-in. The thread already renders unreadable
messages as a lock bubble; that bubble gains a tap target:

> 🔒 Unlock to read
> → password if a wrapper exists, otherwise recovery code.

**Message states in the UI** (never raw JSON, never ciphertext):

| State | Shown as |
|---|---|
| `ENCRYPTED` | normal bubble, thread marked encrypted |
| `LOCKED` | 🔒 "Unlock to read" |
| `LEGACY_PLAINTEXT` | normal bubble, above the encryption divider |
| `PEER_NOT_READY` | composer: "Not encrypted — X hasn't set up encrypted messaging" |
| `NOT_ENROLLED` | composer: "Set up encrypted messaging" |
| `FAILED` | 🔒 "Couldn't decrypt" |

**Encryption divider** — one line in the thread at the first encrypted
message: *"Messages from here are end-to-end encrypted."* Derived
client-side from the first envelope; no schema, no per-message noise, and it
is what makes legacy messages legible as legacy without labelling each one.

**Plaintext fallback — the deliberate trade.** Sending is *not* blocked when
the peer is unenrolled. During rollout almost every peer is unenrolled, and
refusing to send would break the product's core function for a security
property the user cannot influence. Instead: nothing ever claims a plaintext
message is encrypted, the composer states the reason in the thread, and the
encryption divider marks where it changed. If that trade is judged wrong,
the alternative is a per-conversation "encrypted only" toggle — additive
later, not a redesign.

---

## 11. Files to modify

| File | Change |
|---|---|
| `supabase/migrations/0104_vault_enrollment.sql` | **new** — see §12 |
| `src/lib/e2ee/store.ts` | store `masterKey` beside the seed, so any unlocked device can mint a wrapper without the old secret. Bump `DB_VERSION` to 2; a row with a seed but no master key is still valid for reading. |
| `src/lib/e2ee/keys.ts` | `createVault(password \| null, code)`; `openVault` returns the master key; add `wrapForPassword(mk, pw)` / `wrapForRecovery(mk, code)` that take a master key directly rather than re-deriving it from a secret. |
| `src/lib/e2ee/vault.ts` | replace `ensureEncryption` with an explicit `encryptionState(userId)` returning the §9 state, plus `enroll`, `unlockWith`, `confirmRecovery`, `addPasswordWrapper`. Single-flight via `navigator.locks`. Module-cache the row per tab. |
| `src/lib/e2ee/chat.ts` | `sealFor` gates on `E2EE_READY`, not merely on keys being present. Module-level cache for own identity and peer keys. |
| `src/components/e2ee/EncryptionSetup.tsx` | **new** — the sheet. Mounted beside `PresenceHeartbeat` in `src/app/(app)/layout.tsx:153`. Does nothing, and costs no round trip, once `E2EE_READY`. |
| `src/components/e2ee/UnlockSheet.tsx` | **new** — password or recovery code, for `VAULT_EXISTS_DEVICE_LOCKED`. |
| `src/components/e2ee/RecoveryCodeScreen.tsx` | consequence copy; becomes the confirmation step that sets `rc_confirmed_at`. |
| `src/components/messages/RealChatView.tsx` | tap target on the lock bubble; encryption divider; composer states from §10. No change to the stored/derived split. |
| `src/components/auth/AuthCard.tsx` | password paths call `addPasswordWrapper` when the device is unlocked and no wrapper exists — otherwise unchanged. |
| `src/components/settings/AccountForms.tsx` | **F2** — re-wrap on password change, using the old password already in hand. |
| `src/components/auth/ResetPasswordCard.tsx` | **F3** — re-wrap from the local master key if the device is unlocked; otherwise say plainly that the recovery code is now the only route. |
| `src/components/settings/SessionsCard.tsx` | **F4** — forget the *other* accounts' identities, keep the current user's. |
| `android/app/src/main/AndroidManifest.xml` | **F1** — `android:allowBackup="false"`, or `dataExtractionRules` excluding the WebView databases. |
| `docs/E2EE.md` | threat model and claims updated to match. |

---

## 12. Database migration

`supabase/migrations/0104_vault_enrollment.sql` — written, **not applied**.

1. `alter column mk_wrapped_pw drop not null`, same for `salt_pw`.
2. `add column rc_confirmed_at timestamptz` — null until the user confirms.
3. Two check constraints replacing the dropped ones, so the invariant is
   stronger than before rather than weaker:
   - `mk_wrapped_rc` and `salt_rc` are always present — **a vault always has
     a recovery route**;
   - `mk_wrapped_pw` and `salt_pw` are either both present or both absent.
4. `init_user_keys` gains nullable password arguments.
5. `confirm_recovery()` — definer, sets `rc_confirmed_at = now()` on the
   caller's own row, once, and never back to null.
6. `public_keys` filters `where rc_confirmed_at is not null`.
7. Backfill: `update user_keys set rc_confirmed_at = created_at` — every
   existing row was created by the password flow, which already showed and
   confirmed its code.

No data is destroyed and no column is dropped.

---

## 13. Rollback

- **Schema:** `0105_rollback_vault_enrollment.sql` re-adds the NOT NULLs and
  restores the previous `public_keys` body. Only possible while no
  password-less vault exists; once one does, its `mk_wrapped_pw` is null by
  design and the NOT NULL cannot come back. **So the forward migration is
  effectively one-way the moment the first Google user enrolls** — which is
  the real reason to review it before applying rather than after.
- **Client:** every change is behind the state machine. Reverting the client
  to the previous build leaves the extra column and the confirmed flag
  harmless — the old client ignores both and still requires a password
  wrapper, so it simply declines to enroll password-less users.
- **Kill switch:** a `NEXT_PUBLIC_E2EE_ENROLL` flag gating only the setup
  sheet. Turning it off stops new enrollment without affecting anyone already
  enrolled, and without touching the database.
- **No destructive step anywhere.** Nothing re-encrypts existing messages,
  nothing rewrites history, nothing deletes a key.

---

## 14. Outcome

### Built

| Finding | Status |
|---|---|
| F1 Android backup | `allowBackup="false"`. Independent of everything else. |
| F2 password change | `afterPasswordChange` re-wraps from the device's master key, falling back to the old password. Wired into `AccountForms`. |
| F3 password reset | `afterPasswordReset` re-wraps if the device holds the key; otherwise drops the dead wrapper and the reset screen says the recovery code is now the way in. Wired into `ResetPasswordCard`. |
| F4 sign out others | keeps the current account's key (`forgetAllIdentitiesExcept`). |
| F5 unconfirmed vault relied on | `rc_confirmed_at`; `public_keys` hides unconfirmed vaults; `sealFor` also requires *our own* account to be `ready`. |
| F6 enrollment reachable from password paths only | `EncryptionSetup` in the app shell, `enroll`, `reissueRecoveryCode`, `confirmRecovery`. |
| F8 password mandatory | wrapper nullable; `user_keys_recovery_required` check replaces the dropped NOT NULLs. |
| F10 two tabs enrolling | `navigator.locks` around enrollment, re-reading state inside the lock. |
| F12 dead code | `afterPasswordChange` / `afterPasswordReset` now have callers. |
| F13 unmarked legacy | encryption divider ("Messages from here are end-to-end encrypted"), derived from the envelopes — no column. |

### Deviations from the plan

- **`store.ts` `DB_VERSION` was not bumped.** The plan said to. It is
  unnecessary: adding an optional field to a row needs no IndexedDB schema
  change, and a bump would have made every open tab hit `onblocked`.
- **The kill switch is build-time.** `NEXT_PUBLIC_E2EE_ENROLL=off` is inlined
  at build, so turning it off needs a redeploy, not a toggle.
- **The dry run I proposed for the migration was skipped.** It was applied
  directly, on the reasoning that `user_keys` had zero rows and the change is
  additive; it was then verified against the live schema and with ten
  behavioural checks under impersonation in a rolled-back transaction.
- **`enroll`'s own state check is redundant with the database.** Mutation
  testing showed removing it changes nothing observable, because
  `init_user_keys` refuses to overwrite and the client discards its unused
  identity. The server guard is the real protection; the client check only
  saves the wasted key derivation.
- **Password sign-in still shows the recovery screen at sign-in** for a brand
  new vault, as before, because a password is in hand there and the wrapper
  costs nothing. Everyone else meets it in the setup sheet.

### Verified

- 981 unit tests (44 new in `e2ee-enrollment.test.ts`, 5 in `e2ee-chat`),
  `tsc` clean, lint at the 380 baseline, production build clean.
- Mutation-checked: removing the identity-match check and removing the
  own-account gate each fail tests. (Removing `enroll`'s state check does not
  — see above.)
- Database: schema, constraints, grants, and ten behaviours under
  impersonation — passwordless init, no overwrite, unconfirmed invisible to
  others, RLS hides the row, confirm is idempotent, missing recovery refused,
  half a wrapper refused, add/drop wrapper with recovery intact, anon refused.
  Nothing persisted; `user_keys` is empty.
- Real browser (throwaway page, deleted): real IndexedDB, real Web Locks
  (three simultaneous enrollments → exactly one winner), real WebCrypto and
  Argon2id (~200 ms on desktop), A and B enrolling, A sealing "hello", the
  stored body being an envelope, both reading it, a wiped device showing it
  locked, and recovery restoring it. 27/27. Recovery screen's async
  confirmation, including its failure path, 8/8.

### Not verified — and why it matters

**Two real authenticated accounts have not been exercised.** The browser
checks above used an in-page fake for the server. They prove the client code
in a real browser; they do not prove it against real Supabase auth, a real
`messages` row, `RealChatView`'s realtime path, or the setup sheet rendered
inside the authenticated shell. That needs two signed-in sessions, which means
credentials, which are not mine to enter. The remaining step is: sign in as
two accounts in two browser profiles, let the setup sheet run on each, send a
text DM, and read the `messages.body` row back from the database.

### Still open

- **F7 key authenticity.** Nothing lets one person verify another's key.
  Anyone with service-role access can substitute `identity_pub` for a target.
  Safety numbers and a key-change warning are the fix.
- **F9, widened.** Anyone holding a valid session can call `rewrap_recovery`,
  `rewrap_master_key` or `drop_password_wrapper`. They cannot read anything —
  they lack the master key — but they can overwrite a wrapper with garbage,
  destroying that route to the vault. A stolen session can therefore cost a
  user their recovery code. The database cannot check that the new wrapper
  holds the same key. Closing it needs a proof of possession (for instance
  signing the request with the identity's Ed25519 key, verified against
  `signing_pub`).
- **No forward secrecy, no post-compromise security.** Unchanged.
- **Device-to-device transfer, key rotation, revocation, a device table.**
  Nothing in the schema prevents them; none is built.
- **Everything outside 1:1 text** remains plaintext, as before.
- **Sending is not blocked when the peer has no keys.** Deliberate during
  rollout (see §10); an encrypted-only conversation mode is additive later.
