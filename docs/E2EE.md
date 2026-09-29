# End-to-end encryption

Design notes for Hypefy's message encryption. Written while building it, so
it records the reasoning as much as the shape — particularly the parts where
the obvious approach does not work.

**Status: PARKED.** The implementation is complete and tested (`src/lib/e2ee/`,
migrations `0103` and `0104`) but switched off. Hypefy launches on standard
client-server encryption — TLS in transit, encryption at rest, access controls,
and private chat media — because E2EE blocks the server-side moderation an app
store and a 16–24 audience require, and puts a person's whole message history
one lost recovery code from gone. **No message is encrypted, and nothing in this
document is live in the product.** Production held zero encrypted messages and
one unconfirmed vault when it was parked.

To bring it back: set `NEXT_PUBLIC_E2EE=on` and redeploy (the value is inlined at
build time; see `src/lib/e2ee/flag.ts`). It could return as an opt-in "secret
chat" rather than the default, with the moderation limits explained to whoever
turns it on.

## What the product actually promises instead

- Messages are encrypted in transit (TLS) and at rest. Supabase states that all
  customer data is encrypted at rest with AES-256 and in transit via TLS; we claim
  no more than that about backups or key custody, because their page does not
  say.
- **Messages are not end-to-end encrypted.** They are stored so they can be
  delivered, and the people who operate Hypefy can technically read them. At-rest
  encryption protects a stolen disk or backup. It does **not** protect against
  someone with database or service-role access — which is exactly what E2EE would
  have covered. That is a conscious trade, not an equivalent.
- Photos, videos, documents and voice notes in chats are private: shown through
  hour-long signed links, issued only to the uploader and to members of a
  conversation that contains the file (migration `0105`).
- **Insider access is a process, not a mechanism.** Few holders of the
  service-role key; two-factor on the Supabase and Vercel accounts; look at a
  conversation only when it is reported or the law requires it. Nothing in the
  code enforces or logs this. If "we only read reported chats" ever needs to be
  provable, an access log for admin message reads is the next thing to build.

---

## 1. The structure

Three secrets, in a chain. Each one exists to solve a problem the one before
it creates.

```
  a secret only you know              ──Argon2id──▶  KEK
  (your password, or a recovery code)                 │
                                                      │ unwraps
                                                      ▼
  master key ─────────────────────────────────── 32 random bytes
                                                      │
                                                      │ unwraps
                                                      ▼
  seed ────────────────────────────────────────── 32 random bytes
                                                      │
                             ┌────────────────────────┴───────────────┐
                        HKDF │                                        │ HKDF
                             ▼                                        ▼
                   X25519 keypair                            Ed25519 keypair
                   (agree a key with someone)                (prove it was you)
```

### The seed

32 random bytes, made once, on the device, at signup. Both keypairs are
derived from it through HKDF under different labels
(`hypefy/e2ee/box/v1`, `hypefy/e2ee/sign/v1`), so leaking one key never costs
the other.

**This is the only thing that has to survive.** Lose it and every message
ever sent to you is unreadable, permanently, by anyone — including us.

### The master key

32 random bytes. Its only job is to encrypt the seed.

Why not encrypt the seed directly with your password? Because then changing
your password would mean re-encrypting the seed, and every *other* way of
getting in — the recovery code — would have to be re-issued at the same
time. With a master key in the middle, a password change re-encrypts 32
bytes and nothing else moves. Both routes still arrive at the same master
key, so they still arrive at the same identity, so your history still opens.

### The two wraps

The master key is stored **twice**, encrypted under two different keys:

| Stored as | Unwrapped by |
|---|---|
| `mk_wrapped_pw` | Argon2id(your password, `salt_pw`) |
| `mk_wrapped_rc` | Argon2id(your recovery code, `salt_rc`) |

Either opens it. Neither is derivable from the other.

### What the server stores

`public.user_keys`, one row per person:

```
identity_pub   X25519 public key      world-readable
signing_pub    Ed25519 public key     world-readable
seed_wrapped   seed, sealed under the master key
mk_wrapped_pw  master key, sealed under the password-derived key
salt_pw
mk_wrapped_rc  master key, sealed under the recovery-code-derived key
salt_rc
```

The public keys are readable by anyone, because you need someone's public
key in order to write to them. Everything else is an opaque blob — the
server cannot open any of it, and RLS only lets the owner read their own
row. Reading someone else's *public* halves goes through a
`SECURITY DEFINER` function, because RLS works on whole rows and cannot
expose part of one.

There are no insert, update or delete grants on that table at all. Both
writes are definer RPCs, and `init_user_keys` deliberately refuses to
overwrite an identity that already exists — replacing one would strand every
message ever sent to the old identity.

### Sending a message

For a 1:1 text message, the body becomes:

```json
{ "v": 1,
  "boxes": { "<recipientId>": {"n": "...", "c": "..."},
             "<senderId>":    {"n": "...", "c": "..."} },
  "sig": "<Ed25519 over the ciphertext>" }
```

Two sealed copies — one the recipient can open, one you can open, so your own
history is readable on your next phone. Each is X25519 between the two
identities, run through HKDF, then XChaCha20-Poly1305. The additional data
binds the ciphertext to the specific pair of people, so a message lifted from
one conversation will not open in another.

The signature is what makes abuse reports actionable. Without it, a reporter
could attach any plaintext they liked and claim you sent it.

---

## 2. Why logging in cannot be the key

This is the question worth answering carefully, because the instinct behind
it is right: you are signed in, the app knows who you are, why does it need
anything else?

**Because your session is something the server issues.**

Signing in means the server checked something and gave you a token. The
server can produce that token whenever it likes — that is what issuing it
means. So if being signed in were enough to unlock your messages, then the
server could unlock your messages, because it can always be "signed in as
you".

That is not a bug in how we would build it. It is what a session *is*.

And the single thing end-to-end encryption claims is that the server cannot
read your messages. If the server can produce the key, it can read them, and
the claim is false. Not weaker — false.

So the rule is narrow and unavoidable:

> Whatever unlocks the key must be something the server never sees.

A session token fails that test. A password, typed into your own browser and
never sent anywhere, passes it.

### The honest alternative

There is a real design where the server *does* hold the key, and it is worth
naming rather than dismissing. The key sits on the server and is handed to
any authenticated session — exactly the seamless thing.

| | Server holds the key | You hold the secret |
|---|---|---|
| Sign in, chats are there | yes | one extra step |
| Safe if the database leaks | yes | yes |
| Safe if a backup is stolen | yes | yes |
| Safe from Hypefy itself, or a court order | **no** | yes |
| Can be called "end-to-end encrypted" | **no** | yes |

The first column is a genuine improvement on what exists today, and it is
what a lot of apps mean when they say "encrypted". It simply is not
end-to-end, and saying it was would be a claim that does not survive
scrutiny.

---

## 3. Can the account password be the key?

**Yes. It already is — that is exactly what `mk_wrapped_pw` is.**

When someone signs in with email and password, their browser holds the
plaintext password for a moment. That is enough:

1. They type it. The browser has it.
2. Argon2id over it produces the key-encryption key.
3. That unwraps the master key, which unwraps the seed.
4. The seed is written to IndexedDB on that device.
5. The password is discarded. It was never sent anywhere but Supabase's own
   sign-in call, which is what it was for.

From then on that device is unlocked and never needs the password again. On
a new phone, they sign in, and their history opens — which is the behaviour
asked for, and it works.

The password is a good secret for this: it has real entropy, people already
have one, and they are used to typing it on a new device.

### Where it stops working

Three places, and all three are why the recovery code exists.

**Google sign-in.** There is no password. Nothing is ever typed, so there is
nothing to derive a key from. `AuthCard` offers `signInWithOAuth`, so this is
not hypothetical.

**Password reset.** "Forgot password" issues a new one *without knowing the
old one*. That is the point of a reset. But `mk_wrapped_pw` can only be
opened by the old password, so after a reset the password-wrapped copy is
dead. Without a second route, a reset would destroy every message the person
has, permanently, and support could not help — the server has no copy.

**Restoring a session without typing.** The account switcher signs you in
with a stored refresh token (`saved-accounts.ts` → `setSession`). No password
is typed, so no key can be derived. Fine on a device that is already
unlocked; not fine on a new one.

### Why not just a short PIN instead

Because we have no hardware security module.

WhatsApp lets a human-memorable password guard their encrypted backups, and
it is safe because the wrapped key lives in an HSM-backed vault that counts
failed attempts and destroys the key after too many. Signal does the same
thing with SGX enclaves. The rate limiting is enforced by hardware the
operator cannot talk around.

We would be storing the wrapped blob in Postgres. Anyone who takes a copy of
that database can try every guess offline, as fast as they like, with nobody
to ask. A 6-digit PIN is 10⁶ possibilities; even against Argon2id at 19 MiB
that is on the order of an hour on good hardware. A short PIN is not a
secret in that setting.

So the everyday secret has to be something with real entropy — an account
password — and the fallback has to be a recovery code, which is 100 bits by
construction.

---

## 4. The recovery code

20 characters from a 32-letter alphabet, which is 100 bits — not guessable,
and not something an offline attacker can work through.

The alphabet excludes `I`, `L`, `O` and `U`, and input is normalised so
`O`→`0`, `I`/`L`→`1`, `U`→`V`, case is ignored and dashes and spaces are
stripped. Somebody reads this off a piece of paper a year after writing it
down; it should not matter whether they wrote a zero or an O.

It exists for exactly the three cases above: Google sign-in, after a password
reset, and restoring an account that was switched to rather than typed into.

It is shown once, at setup, and never again — it is not stored anywhere the
server can read, which is the entire point. Showing it again later would mean
keeping it behind an ordinary login, which quietly turns the whole design
back into a server-held key.

---

## 5. What this will and will not promise

**Will:** Hypefy's servers and database hold only ciphertext for encrypted
messages. A database dump, a stolen backup, a rogue admin, or a subpoena of
the database yields nothing readable.

**Will not**, and these belong in the privacy policy rather than being
discovered later:

1. **The server ships the code that decrypts.** `capacitor.config.ts` points
   the Android app at `https://app.hypefy.chat` rather than bundling the
   site, so the same server that stores the ciphertext serves the JavaScript
   that opens it. True of WhatsApp Web and Instagram too. It makes the claim
   *"we do not read your messages"*, not Signal's *"we could not if we
   tried"*.

2. **No forward secrecy in v1.** Keys are long-lived per person, not ratcheted
   per message, so someone who obtains a private key can read that person's
   history. A Double Ratchet can be layered on later without changing how
   anything is stored.

3. **Metadata stays visible** — who talks to whom, how often, when, and
   roughly how much.

4. **Not covered in v1:** group chats, media, voice notes, reactions,
   server-authored system messages, page replies.

5. **Media is worse than unencrypted — it is public.** `chat-media` and
   `voice-notes` are public buckets served from permanent URLs. Anyone with a
   link reads a photo, video, document or voice note indefinitely, today.
   `0034_chat_documents.sql` says so in its own header. Encrypting text while
   that is true would be close to dishonest, and fixing it is smaller work
   than the encryption itself.

---

## 6. Where the code is

| | |
|---|---|
| `src/lib/e2ee/crypto.ts` | primitives only — bytes in, bytes out, no storage or network |
| `src/lib/e2ee/keys.ts` | the lifecycle: make a vault, open it, re-wrap it |
| `src/lib/e2ee/store.ts` | IndexedDB, **keyed by user id** — one device holds several accounts |
| `src/lib/e2ee/vault.ts` | the glue: Supabase and the device |
| `src/lib/e2ee/message.ts` | the envelope that sits in `messages.body` |
| `src/lib/e2ee/chat.ts` | what a screen calls: can I seal this, can I open that |
| `supabase/migrations/0103_user_keys.sql` | the table, its RLS, and the three definer RPCs |
| `tests/e2ee-*.test.ts` | 76 tests, written as properties rather than happy paths |


## 7. What is actually wired

Encryption is on for **1:1 text messages only**, and only between two
people who both have keys. Everything else — groups, photos, videos,
voice notes, documents, GIFs, songs, page replies, reactions, system
notices — still goes in plaintext, and the composer says so in the thread
rather than letting anyone assume otherwise.

The path a message takes:

1. `send()` asks `sealFor` for an envelope. Null means the other person
   has no keys yet, or this device is locked; the message goes plaintext
   and the thread shows the notice.
2. `send_message` stores the envelope. The RPC needed no change — all it
   ever asked of a body was that it not be empty.
3. The thread keeps the stored rows exactly as the server has them, and
   derives what it renders. Every arrival route — the server render, the
   older-messages page, the catch-up fetch, the realtime echo — ends in
   that one array, so decryption happens in one place.
4. The inbox preview and the in-app toast each open the last message the
   same way, with the peer's key.

Anything that cannot be opened shows as locked rather than as an
envelope: a device signed in but never unlocked, or a sender who rebuilt
their identity. The words are not lost — another device holding the key
still reads them.

### Still to do

- **No real signed-in session has created a vault yet.** SQL proves the
  RPCs, a fake client proves the glue, a harness proves the screen; the
  three have never met in one browser.
- Android Keystore for the local seed. IndexedDB is an application store,
  not the strongest boundary the platform offers; `android:allowBackup`
  needs auditing alongside it.
- `chat-media` and `voice-notes` are public buckets with permanent URLs.
  That is a hole with or without encryption.
- Search (`ilike` on the server) matches only older plaintext.
- Groups, media, and lock-screen decryption.
