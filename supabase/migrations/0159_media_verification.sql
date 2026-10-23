-- The server-side half: what the hash actually is, and what to do about it.
--
-- 0157 records the hash the CLIENT claimed. A crafted request can claim the
-- hash of a different picture, so that check stops a person re-posting a
-- photo and not a person writing an HTTP client.
--
-- /api/moderation/verify fetches each stored object, hashes the bytes with
-- sharp, and calls the two functions below: one to record what is true, one
-- to raise a flag when it matches the blocklist. Two functions rather than
-- plain updates because `media_fingerprints.hash` is bit(64) and PostgREST
-- sends a string — the same lesson 0158 learned at the other end.
--
-- Nothing here removes content. A perceptual match is a judgement with a
-- false-positive rate, and wrongly deleting somebody's photo is the
-- expensive direction; it raises a report, which puts it in front of the
-- human who already has a queue, a takedown button and an appeal path.

-- ─────────────────────────────────────────────────────────────────────────
-- A report nobody filed
-- ─────────────────────────────────────────────────────────────────────────
--
-- reporter_id becomes nullable, and null means "raised by the system". The
-- admin queue already renders a missing reporter rather than breaking on it
-- (it left-joins and falls back), so this is additive.

alter table public.reports alter column reporter_id drop not null;

-- The existing unique is (reporter_id, target_type, target_id), and in
-- Postgres two nulls are distinct — so without this, every run of the
-- verification job would file another identical system report for the same
-- picture. One open system flag per target is the whole intent.
create unique index if not exists reports_system_target_key
  on public.reports (target_type, target_id)
  where reporter_id is null;

-- ─────────────────────────────────────────────────────────────────────────
-- Recording what the hash really is
-- ─────────────────────────────────────────────────────────────────────────

/**
 * Overwrite a fingerprint with the hash the server computed, and mark it
 * verified.
 *
 * A malformed hash marks the row verified WITHOUT touching the hash. The
 * point is that one unreadable object cannot wedge the queue behind it
 * forever — the job would otherwise pick the same row up on every run.
 */
create or replace function public.set_verified_hash(p_id uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bits bit(64) := public.media_hash_bits(p_hash);
begin
  if bits is null then
    update public.media_fingerprints set verified = true where id = p_id;
  else
    update public.media_fingerprints
       set hash = bits, verified = true
     where id = p_id;
  end if;
end;
$function$;

revoke all on function public.set_verified_hash(uuid, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Raising a flag
-- ─────────────────────────────────────────────────────────────────────────

/**
 * File a system report against content whose real hash is on the blocklist.
 *
 * `on conflict do nothing` against the partial index above, so re-running the
 * job is free and a target collects one open flag rather than a pile.
 *
 * The reason is written for the person who will read it in the queue, and
 * says what was found rather than what to do about it.
 */
create or replace function public.raise_media_report(
  p_target_type text,
  p_target_id uuid
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.reports (reporter_id, target_type, target_id, reason, details, status)
  values (
    null,
    p_target_type,
    p_target_id,
    'automated',
    'The image matches one previously removed by a moderator. Flagged by the upload check, not removed — please confirm before acting.',
    'open'
  )
  on conflict do nothing;
$function$;

revoke all on function public.raise_media_report(text, uuid) from public, anon, authenticated;
