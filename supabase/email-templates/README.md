# Supabase email templates

Paste these into **Authentication → Emails → Templates** in the Supabase
dashboard. They are kept here because a dashboard textarea is not
version-controlled, and a template regression is invisible until someone
cannot sign in.

| File | Dashboard template | Used by |
| --- | --- | --- |
| `magic-link.html` | **Magic Link** | two-step verification, and "Email me a code instead" |
| `confirm-signup.html` | **Confirm signup** | a new account, and Resend on the check-email screen |
| `reset-password.html` | **Reset Password** | "Forgot password" |
| `change-email.html` | **Change Email Address** | Settings → Account → change email |

## Why Magic Link needs changing

Both code flows call `signInWithOtp({ shouldCreateUser: false })`, and
Supabase sends the **Magic Link** template for an existing user.

The stock template contains only `{{ .ConfirmationURL }}` — a link. It never
prints `{{ .Token }}`, the 6-digit code. Supabase generates the code either
way, so the email arrives with no code in it and `/verify-2step` asks for
something that was never sent.

Adding `{{ .Token }}` is the whole fix.

## Codes vs links

Only **Magic Link** prints `{{ .Token }}`. The other two are link-based by
design and must keep `{{ .ConfirmationURL }}`:

- **Reset Password** — the link carries the recovery code to
  `/auth/callback?next=/reset-password`, the only route to the
  set-a-new-password screen. A code cannot reach it, so swapping one in
  would break recovery outright.
- **Confirm signup** — `signUp()` passes
  `emailRedirectTo = <origin>/auth/callback`, and no screen in the app asks
  a new account for a typed confirmation code. A code here would be an
  instruction nothing can carry out.

**Change Email Address** is sent TWICE with Secure email change on — once
to the old address, once to the new — and the change lands only when both
links are followed. That is why its copy names both addresses: the same
words arrive in two inboxes and the reader has to tell which is which.

The two remaining stock templates (Invite, Reauthentication) are not
reachable from anything the app calls today.

## Before any real volume

These go out on Supabase's built-in sender, which is rate-limited to a
handful of emails an hour and is documented as not for production. Sign-up,
password reset and two-step codes all depend on it, so **custom SMTP has to
be configured before launch** — Authentication → Emails → SMTP Settings.
Until then, a busy hour silently stops people signing in.

## Worth checking while you're in there

- **Authentication → Providers → Email → Email OTP Expiration.** The default
  is 3600s (1 hour), which is long for a second factor. 600s is reasonable.
- OTP length defaults to 6. `Verify2StepCard` enables its submit button at 6
  characters, so if you change the length, change that check too.
