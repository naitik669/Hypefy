-- Encryption that does not depend on how you signed in.
--
-- 0103 assumed a password. It is the only moment a plaintext secret exists
-- in the browser, so deriving a key from it was the obvious move — but it
-- left everyone who signs in with Google, with an emailed code, or simply by
-- still being signed in from last week, with no way to ever get an identity.
-- That is most people.
--
-- So the password becomes one optional wrapper around the master key rather
-- than the foundation under it. What stays mandatory is the recovery code:
-- every vault has one, always, and a vault only counts once its owner has
-- actually seen it.
--
-- Nothing is dropped and nothing is rewritten. The two NOT NULLs that go
-- away are replaced by check constraints that say something stronger.

-- ── the password wrapper becomes optional ──────────────────────────────

alter table public.user_keys alter column mk_wrapped_pw drop not null;
alter table public.user_keys alter column salt_pw       drop not null;

-- Both halves of a wrapper travel together or not at all. A blob without
-- its salt is unopenable, and a salt without its blob is a lie about which
-- routes exist.
alter table public.user_keys
  drop constraint if exists user_keys_pw_wrapper_whole;
alter table public.user_keys
  add constraint user_keys_pw_wrapper_whole
  check ((mk_wrapped_pw is null) = (salt_pw is null));

-- The invariant that replaces the ones above, and the reason this migration
-- is safe: there is always a way back in that does not depend on a password
-- or on any one device.
alter table public.user_keys
  drop constraint if exists user_keys_recovery_required;
alter table public.user_keys
  add constraint user_keys_recovery_required
  check (mk_wrapped_rc is not null and salt_rc is not null);

-- ── a vault does not count until its owner has seen the code ───────────
--
-- Creating keys and relying on them are different events. Between them sits
-- the only moment the recovery code is ever visible, and somebody who clears
-- their browser in that gap would lose every encrypted message with no way
-- back. So encryption switches on here, not at insert.

alter table public.user_keys
  add column if not exists rc_confirmed_at timestamptz;

comment on column public.user_keys.rc_confirmed_at is
  'When the owner confirmed they had saved their recovery code. Null means the vault exists but must not be encrypted to yet.';

-- Every row that exists today came from the password flow, which showed the
-- code and made them type part of it back before going any further.
update public.user_keys
   set rc_confirmed_at = created_at
 where rc_confirmed_at is null;

-- ── only confirmed vaults are discoverable ─────────────────────────────
--
-- This is what keeps the rule in one place. "Has keys" and "is ready to
-- receive encrypted messages" become the same question, answered by the
-- server, so no client can seal a message to somebody who has no secured
-- way of ever reading it again.

create or replace function public.public_keys(p_user_ids uuid[])
returns table (user_id uuid, identity_pub text, signing_pub text)
language sql
security definer
set search_path = public
stable
as $$
  select k.user_id, k.identity_pub, k.signing_pub
  from public.user_keys k
  where k.user_id = any(p_user_ids)
    and k.rc_confirmed_at is not null;
$$;

comment on function public.public_keys(uuid[]) is
  'The public halves of confirmed vaults only. Definer because RLS cannot expose part of a row.';

revoke all on function public.public_keys(uuid[]) from public, anon;
grant execute on function public.public_keys(uuid[]) to authenticated;

-- ── creating an identity, with or without a password ───────────────────
--
-- Same function, same refusal to overwrite. The password arguments are now
-- nullable, which is the whole point: a Google or one-time-code user creates
-- exactly the same vault, minus one wrapper.

create or replace function public.init_user_keys(
  p_identity_pub  text,
  p_signing_pub   text,
  p_seed_wrapped  text,
  p_mk_wrapped_pw text,
  p_salt_pw       text,
  p_mk_wrapped_rc text,
  p_salt_rc       text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_inserted boolean;
begin
  if v_me is null then
    raise exception 'Not signed in';
  end if;

  if p_mk_wrapped_rc is null or p_salt_rc is null then
    raise exception 'A vault must have a recovery wrapper';
  end if;

  -- Deliberately does not overwrite. Replacing an identity would strand
  -- every message ever sent to the old one, unreadable forever, and a
  -- silently-retried setup must not be able to do that. The caller gets
  -- false and reads the existing row instead.
  insert into public.user_keys (
    user_id, identity_pub, signing_pub, seed_wrapped,
    mk_wrapped_pw, salt_pw, mk_wrapped_rc, salt_rc
  ) values (
    v_me, p_identity_pub, p_signing_pub, p_seed_wrapped,
    p_mk_wrapped_pw, p_salt_pw, p_mk_wrapped_rc, p_salt_rc
  )
  on conflict (user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke all on function public.init_user_keys(text,text,text,text,text,text,text) from public, anon;
grant execute on function public.init_user_keys(text,text,text,text,text,text,text) to authenticated;

-- ── confirming the recovery code ───────────────────────────────────────
--
-- One way only. Un-confirming would hide somebody's keys from the people
-- already messaging them, which reads to those people as the account
-- vanishing mid-conversation.

create or replace function public.confirm_recovery()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not signed in';
  end if;

  update public.user_keys
     set rc_confirmed_at = coalesce(rc_confirmed_at, now()),
         updated_at      = now()
   where user_id = v_me;

  if not found then
    raise exception 'No keys to confirm';
  end if;
end $$;

revoke all on function public.confirm_recovery() from public, anon;
grant execute on function public.confirm_recovery() to authenticated;

-- ── dropping a password wrapper ────────────────────────────────────────
--
-- After a password reset the old wrapper opens nothing. Leaving it in place
-- would have the client offer a password route that can only ever fail, so
-- a device that cannot re-wrap should be able to say so instead.
--
-- The recovery wrapper is untouched, and the check constraint above means
-- this can never leave a vault with no way in.

create or replace function public.drop_password_wrapper()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not signed in';
  end if;

  update public.user_keys
     set mk_wrapped_pw = null,
         salt_pw       = null,
         updated_at    = now()
   where user_id = v_me;

  if not found then
    raise exception 'No keys to change';
  end if;
end $$;

revoke all on function public.drop_password_wrapper() from public, anon;
grant execute on function public.drop_password_wrapper() to authenticated;
