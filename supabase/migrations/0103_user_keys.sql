-- Where a person's encryption identity lives.
--
-- One row per user. It holds two public keys, which anyone may read because
-- you need someone's public key to write to them, and three private things
-- that only their owner may ever see:
--
--   seed_wrapped   the identity seed, encrypted under a master key
--   mk_wrapped_pw  that master key, encrypted under a key derived from
--                  their password
--   mk_wrapped_rc  the same master key, encrypted under a key derived from
--                  their recovery code
--
-- Wrapping the master key twice rather than the seed twice means changing a
-- password re-encrypts 32 bytes, and both routes lead to the same identity —
-- so history survives either way in.
--
-- The server never sees a master key, a seed, or a password. It stores
-- opaque blobs and hands them back to their owner.
--
-- Columns are text holding base64, not bytea. PostgREST renders bytea as a
-- \x hex string that every client would have to parse back; base64 is what
-- the browser produces and consumes already.

create table if not exists public.user_keys (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  version       smallint    not null default 1,
  identity_pub  text        not null,
  signing_pub   text        not null,
  seed_wrapped  text        not null,
  mk_wrapped_pw text        not null,
  salt_pw       text        not null,
  mk_wrapped_rc text        not null,
  salt_rc       text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.user_keys is
  'End-to-end encryption identity. Public keys are world-readable; the wrapped blobs are opaque to the server and readable only by their owner.';

alter table public.user_keys enable row level security;

-- Read your own row, whole. Everyone else goes through public_keys() below,
-- which returns only the public halves — RLS is row-level, so the split has
-- to be a function rather than a policy.
drop policy if exists "user_keys: owner reads own" on public.user_keys;
create policy "user_keys: owner reads own" on public.user_keys
  for select using (auth.uid() = user_id);

-- No insert, update or delete grants. Both writes are definer RPCs, so the
-- one rule that matters — you cannot overwrite an existing identity — is
-- enforced in one place rather than trusted to a policy.
revoke all on public.user_keys from anon, authenticated, public;
grant select on public.user_keys to authenticated;

-- ── reading someone else's public keys ─────────────────────────────────

create or replace function public.public_keys(p_user_ids uuid[])
returns table (user_id uuid, identity_pub text, signing_pub text)
language sql
security definer
set search_path = public
stable
as $$
  select k.user_id, k.identity_pub, k.signing_pub
  from public.user_keys k
  where k.user_id = any(p_user_ids);
$$;

comment on function public.public_keys(uuid[]) is
  'The public halves only. Definer because RLS cannot expose part of a row.';

revoke all on function public.public_keys(uuid[]) from public, anon;
grant execute on function public.public_keys(uuid[]) to authenticated;

-- ── creating an identity, exactly once ─────────────────────────────────

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

-- ── re-wrapping after a password change ────────────────────────────────

create or replace function public.rewrap_master_key(
  p_mk_wrapped_pw text,
  p_salt_pw       text
) returns void
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

  -- Only the password-wrapped copy moves. The identity, the seed and the
  -- recovery-code copy are untouched, so a password change cannot lose
  -- history and cannot invalidate the recovery code.
  update public.user_keys
     set mk_wrapped_pw = p_mk_wrapped_pw,
         salt_pw       = p_salt_pw,
         updated_at    = now()
   where user_id = v_me;

  if not found then
    raise exception 'No keys to rewrap';
  end if;
end $$;

revoke all on function public.rewrap_master_key(text,text) from public, anon;
grant execute on function public.rewrap_master_key(text,text) to authenticated;

-- ── replacing a spent recovery code ────────────────────────────────────

create or replace function public.rewrap_recovery(
  p_mk_wrapped_rc text,
  p_salt_rc       text
) returns void
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
     set mk_wrapped_rc = p_mk_wrapped_rc,
         salt_rc       = p_salt_rc,
         updated_at    = now()
   where user_id = v_me;

  if not found then
    raise exception 'No keys to rewrap';
  end if;
end $$;

revoke all on function public.rewrap_recovery(text,text) from public, anon;
grant execute on function public.rewrap_recovery(text,text) to authenticated;
