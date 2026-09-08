-- ─────────────────────────────────────────────────────────────────────
-- Recovery codes for two-factor authentication.
--
-- Real 2FA (TOTP, enforced server-side) means a lost phone is a lost
-- account unless there is a second way in. These are it: eight single-use
-- codes, shown once, stored only as bcrypt hashes.
--
-- What a recovery code CANNOT do, and the reason the UI has to say so
-- plainly: it cannot get you an AAL2 session. Postgres cannot mint a GoTrue
-- JWT, and GoTrue exposes no endpoint that trades an application secret for
-- one — mfa.verify() only accepts a TOTP code against a challenge it issued
-- itself. So redeeming a code AUTHORISES TURNING TWO-FACTOR OFF: the app
-- route deletes the factor with the service role, signs every session out,
-- and the user gets back in with their password alone. That is the whole
-- feature, and it is enough.
--
-- Shaped after 0031_pgcrypto_and_locks.sql, which is the right template and
-- already proven here: RLS on with ZERO policies plus a table-level revoke,
-- so the hashes are reachable through no path but these functions; bcrypt
-- via crypt()/gen_salt(); and rate_limit() called BEFORE the comparison.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.mfa_recovery_codes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Verification only ever walks a user's UNUSED codes, so the index carries
-- the same predicate.
create index if not exists mfa_recovery_codes_unused_idx
  on public.mfa_recovery_codes (user_id) where used_at is null;

alter table public.mfa_recovery_codes enable row level security;
revoke all on table public.mfa_recovery_codes from anon, authenticated;

-- generate_mfa_recovery_codes: the ONLY call that ever returns plaintext.
--
-- Replaces the whole set rather than topping it up — a half-used sheet and a
-- fresh sheet in circulation at once is how someone ends up trusting a code
-- that no longer works. Regeneration is this same function.
create or replace function public.generate_mfa_recovery_codes()
returns setof text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Generous, because this is a once-in-an-account-lifetime action, but not
  -- unbounded: each call burns eight bcrypt rounds.
  perform public.rate_limit('mfa_recovery_gen', 5, interval '1 hour');

  delete from public.mfa_recovery_codes where user_id = v_uid;

  for i in 1..8 loop
    -- 40 bits, hyphenated to be transcribable off a piece of paper. The
    -- entropy is the security margin here; bcrypt is belt and braces.
    v_code := substr(encode(gen_random_bytes(5), 'hex'), 1, 5)
              || '-'
              || substr(encode(gen_random_bytes(5), 'hex'), 1, 5);

    insert into public.mfa_recovery_codes (user_id, code_hash)
    values (v_uid, crypt(v_code, gen_salt('bf', 10)));

    return next v_code;
  end loop;
end $$;

-- verify_mfa_recovery_code: single use, and it says so by marking the row.
--
-- Rate-limited before the comparison for the reason verify_lock_pin gives:
-- both failed and successful attempts count, so a grind gets cut off even if
-- it would have landed on the next try. The up-to-eight bcrypt comparisons
-- per attempt (~0.8s) are the other half of that defence.
create or replace function public.verify_mfa_recovery_code(p_code text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := (select auth.uid());
  v_row record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  perform public.rate_limit('mfa_recovery', 10, interval '15 minutes');

  -- Normalised the way a human retypes it: codes are lower-case hex, and
  -- whether someone included the hyphen should not decide whether they get
  -- back into their account.
  p_code := lower(btrim(coalesce(p_code, '')));
  if p_code = '' then return false; end if;

  for v_row in
    select id, code_hash from public.mfa_recovery_codes
    where user_id = v_uid and used_at is null
  loop
    if v_row.code_hash = crypt(p_code, v_row.code_hash) then
      update public.mfa_recovery_codes set used_at = now() where id = v_row.id;
      return true;
    end if;
  end loop;

  return false;
end $$;

-- How many are left, for the "you have 2 codes remaining" nudge. Never
-- exposes a hash.
create or replace function public.mfa_recovery_codes_remaining()
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.mfa_recovery_codes
  where user_id = (select auth.uid()) and used_at is null;
$$;

-- Used when two-factor is turned off: codes for a factor that no longer
-- exists are just a lost sheet of paper with secrets on it.
create or replace function public.clear_mfa_recovery_codes()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  delete from public.mfa_recovery_codes where user_id = (select auth.uid());
end $$;

-- Nothing in this repo closes new SECURITY DEFINER functions automatically —
-- 0027_lock_down_anon_rpcs.sql was a one-time sweep over what existed then.
-- Every one has to be closed by hand, every time.
revoke all on function public.generate_mfa_recovery_codes() from public, anon;
grant execute on function public.generate_mfa_recovery_codes() to authenticated;
revoke all on function public.verify_mfa_recovery_code(text) from public, anon;
grant execute on function public.verify_mfa_recovery_code(text) to authenticated;
revoke all on function public.mfa_recovery_codes_remaining() from public, anon;
grant execute on function public.mfa_recovery_codes_remaining() to authenticated;
revoke all on function public.clear_mfa_recovery_codes() from public, anon;
grant execute on function public.clear_mfa_recovery_codes() to authenticated;
