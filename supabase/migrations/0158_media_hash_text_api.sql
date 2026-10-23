-- The hash crosses the wire as text, so the API has to take text.
--
-- 0157 gave `claim_media` and `is_media_blocked` a `bit` parameter, which is
-- right inside the database and wrong at its edge. PostgREST sends a JSON
-- string, and a hex string cast straight to bit(64) does not fail quietly —
-- it raises `"a" is not a valid binary digit`, so every call would have been
-- an error rather than a check. Caught by trying the cast rather than by
-- reading the signature.
--
-- The client produces sixteen lowercase hex characters (src/lib/media-hash.ts).
-- These take exactly that, validate the shape, and convert once.
--
-- Validation is not politeness. `('x' || p_hash)::bit(64)` on a 15-character
-- string silently yields a DIFFERENT 64 bits rather than failing, so a
-- truncated hash would be recorded as a real fingerprint and never match
-- anything again.

create or replace function public.media_hash_bits(p_hash text)
returns bit
language sql
immutable
parallel safe
set search_path to 'public'
as $function$
  select case
    when p_hash ~ '^[0-9a-f]{16}$' then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
 then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
 then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
 then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
 then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
 then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
 then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
 then ('x' || p_hash)::bit(64)
    else null
  end;
$function$;

/**
 * Is this picture on the blocklist?
 *
 * A bare boolean and nothing else — not which entry matched, not how close.
 * Those would turn the function into a gradient to climb.
 *
 * A malformed hash answers false. The alternative is raising, which would
 * make a client bug look like a blocked picture and stop someone posting.
 */
create or replace function public.check_media(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.media_hash_bits(p_hash) is null then false
    else public.is_media_blocked(public.media_hash_bits(p_hash))
  end;
$function$;

revoke all on function public.check_media(text) from public, anon;
grant execute on function public.check_media(text) to authenticated;

-- The bit-parameter version goes. Leaving both would mean two ways in, one
-- of which cannot be called successfully.
drop function if exists public.claim_media(text, uuid, text, bit);

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row written is the hash that was judged.
 *
 * Returns true when the picture is blocked. An unreadable hash — the client
 * could not decode the file — records nothing and answers false, because
 * "we do not know" must never read as "refuse".
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64);
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: someone who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, text) from public, anon;
grant execute on function public.claim_media(text, uuid, text, text) to authenticated;
