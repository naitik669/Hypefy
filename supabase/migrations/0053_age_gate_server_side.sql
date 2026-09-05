-- The age gate lived entirely in the browser.
--
-- AuthCard blocks signup under 13 and writes date_of_birth / age_confirmed
-- into Supabase auth user_metadata — which the client can write to itself, so
-- it was never a gate, only a prompt. Nothing server-side ever read either
-- field: no column, no policy, no trigger, no route.
--
-- Two leaks made it worse than "bypassable by someone determined":
--
--  1. handleGoogle() only runs the age and consent checks when
--     mode === 'signup'. Google OAuth creates the account if it does not
--     exist, so the "Continue with Google" button on the SIGN-IN page created
--     accounts with no age check and no consent at all.
--  2. The Google path parks the date of birth in localStorage and applies it
--     after the redirect. If that never lands — expired 15-minute TTL,
--     localStorage unavailable, the native deep link returning to a different
--     browser — the account exists and is fully usable with nothing recorded.
--
-- Result in production: 15 of 17 accounts have no date of birth anywhere.
--
-- This puts it in the database. The column is deliberately absent from 0050's
-- writable allowlist, so a user cannot set or change their own recorded age —
-- only handle_new_user and the definer RPC below can.

alter table public.profiles
  add column if not exists date_of_birth date;

-- Carry across what the two signup-path accounts already recorded.
update public.profiles p
   set date_of_birth = (u.raw_user_meta_data ->> 'date_of_birth')::date
  from auth.users u
 where u.id = p.id
   and p.date_of_birth is null
   and u.raw_user_meta_data ->> 'date_of_birth' is not null
   and (u.raw_user_meta_data ->> 'date_of_birth') ~ '^\d{4}-\d{2}-\d{2}$';

-- New accounts get it at creation, from the metadata the signup call sets,
-- rather than depending on a second client round-trip that may never happen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dob date;
begin
  -- A malformed or absent value must not stop the account being created; the
  -- app gate below catches a null and asks for it.
  begin
    if new.raw_user_meta_data ->> 'date_of_birth' ~ '^\d{4}-\d{2}-\d{2}$' then
      v_dob := (new.raw_user_meta_data ->> 'date_of_birth')::date;
    end if;
  exception when others then
    v_dob := null;
  end;

  insert into public.profiles (id, date_of_birth)
  values (new.id, v_dob)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The one way to record an age, for accounts that arrived without one — the
-- Google path, and everyone who signed up before this migration.
--
-- Write-once: it will not overwrite a date already on file, so this cannot be
-- used to edit your way past an under-13 result.
create or replace function public.set_date_of_birth(p_dob date)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_dob is null or p_dob > current_date then
    raise exception 'That date is not valid.';
  end if;
  if p_dob < current_date - interval '120 years' then
    raise exception 'That date is not valid.';
  end if;
  if p_dob > current_date - interval '13 years' then
    raise exception 'You must be at least 13 years old to use Hypefy.';
  end if;

  update public.profiles
     set date_of_birth = p_dob
   where id = v_uid and date_of_birth is null;
end $$;

revoke execute on function public.set_date_of_birth(date) from public, anon;
grant  execute on function public.set_date_of_birth(date) to authenticated;

-- Convenience for the app gate: is this account old enough to be here?
-- Null means "we never asked", which the gate treats as "ask now" rather than
-- as a pass.
create or replace function public.age_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select date_of_birth is not null
     and date_of_birth <= current_date - interval '13 years'
    from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.age_ok() from public, anon;
grant  execute on function public.age_ok() to authenticated;
