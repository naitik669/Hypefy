# Supabase email templates

Paste these into **Authentication → Emails → Templates** in the Supabase
dashboard. They are kept here because a dashboard textarea is not
version-controlled, and a template regression is invisible until someone
cannot sign in.

| File | Dashboard template | Used by |
| --- | --- | --- |
| `magic-link.html` | **Magic Link** | two-step verification, and "Email me a code instead" |

## Why Magic Link needs changing

Both code flows call `signInWithOtp({ shouldCreateUser: false })`, and
Supabase sends the **Magic Link** template for an existing user.

The stock template contains only `{{ .ConfirmationURL }}` — a link. It never
prints `{{ .Token }}`, the 6-digit code. Supabase generates the code either
way, so the email arrives with no code in it and `/verify-2step` asks for
something that was never sent.

Adding `{{ .Token }}` is the whole fix.

## Leave the others alone

**Reset Password** must keep `{{ .ConfirmationURL }}`. That flow is
link-based by design: the link carries the recovery code to
`/auth/callback?next=/reset-password`, which is the only route to the
set-a-new-password screen. Replacing it with a code would break recovery.

## Worth checking while you're in there

- **Authentication → Providers → Email → Email OTP Expiration.** The default
  is 3600s (1 hour), which is long for a second factor. 600s is reasonable.
- OTP length defaults to 6. `Verify2StepCard` enables its submit button at 6
  characters, so if you change the length, change that check too.
