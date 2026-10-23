-- Making a takedown stick.
--
-- Remove a picture today and nothing stops it being posted again tomorrow.
-- Re-uploading removed content is the commonest evasion there is and it needs
-- no sophistication at all — the same file, from the same gallery, by the
-- same person or by anyone they sent it to.
--
-- Two tables and a loop between them:
--
--   media_fingerprints   the perceptual hash of every image uploaded, kept
--                        against the thing it belongs to.
--   blocked_media        hashes that may not be posted again.
--
-- When a moderator removes a post or a Shot, its fingerprints are harvested
-- into blocked_media automatically. The next attempt to post the same picture
-- is refused without anybody looking at it. That is the whole mechanism, and
-- it costs one hash comparison per upload.
--
-- ── What this is not ───────────────────────────────────────────────────────
--
-- It is not abuse detection. It recognises pictures already judged bad; it
-- knows nothing about one it has never seen. Detecting novel material needs a
-- vetted hash list (NCMEC, IWF, Project Arachnid) or a classifier, and both
-- are procured rather than written. This is the table those write into when
-- they arrive — a third-party scanner inserts into blocked_media and
-- everything downstream already works.
--
-- ── What is still bypassable ───────────────────────────────────────────────
--
-- The hash is computed by the client and sent with the upload. A browser can
-- lie: send the hash of a different picture and the check passes. That is
-- worth saying plainly rather than discovering later.
--
-- It is still worth shipping, because the behaviour it stops is a person
-- re-posting a photo, not a person writing an HTTP client. The authoritative
-- version recomputes the hash server-side from the stored object — pg_net is
-- installed and a storage trigger can reach an edge function — and that is
-- the next piece of work, not this one. `verified` exists for it: false for
-- everything the client told us, true for anything the server has checked
-- itself.

-- ─────────────────────────────────────────────────────────────────────────
-- The blocklist
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.blocked_media (
  -- 64-bit dHash. bit(64) rather than text so the distance is bit_count(a # b)
  -- rather than string arithmetic.
  hash bit(64) primary key,
  -- Where it came from: 'takedown' when harvested from removed content,
  -- 'manual' when a moderator added it directly, and later the name of
  -- whichever scanner contributed it.
  source text not null default 'takedown',
  note text,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now()
);

alter table public.blocked_media enable row level security;

-- Deliberately no policies. Nobody reads this table through the API, not even
-- an admin: anyone who can read it can test a picture against it offline and
-- nudge it until it passes. Everything goes through the function below, which
-- answers one yes-or-no question and reveals nothing else.
revoke all on table public.blocked_media from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- What each upload hashed to
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.media_fingerprints (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'shot', 'comment', 'message')),
  target_id uuid not null,
  url text not null,
  hash bit(64) not null,
  user_id uuid references public.profiles(id) on delete set null,
  -- False while the hash is only what the client claimed.
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, url)
);

alter table public.media_fingerprints enable row level security;

-- Same reasoning: a fingerprint is only useful to someone working out what
-- the blocklist holds. Written by the function below, read by nothing.
revoke all on table public.media_fingerprints from anon, authenticated;

-- Harvesting walks these by target, and the blocklist check walks hashes.
create index if not exists media_fingerprints_target_idx
  on public.media_fingerprints (target_type, target_id);
create index if not exists media_fingerprints_hash_idx
  on public.media_fingerprints (hash);

-- ─────────────────────────────────────────────────────────────────────────
-- Asking whether a picture may be posted
-- ─────────────────────────────────────────────────────────────────────────

/**
 * How many bits may differ and still count as the same picture.
 *
 * Must stay equal to MATCH_DISTANCE in src/lib/media-hash.ts, where the
 * measurement that chose it is written down. 6 of 64 bits: a re-encode costs
 * one or two, two unrelated pictures sit about thirty-two apart.
 */
create or replace function public.media_match_distance()
returns integer language sql immutable parallel safe
set search_path to 'public'
as $function$ select 6 $function$;

/**
 * Is this hash close to anything on the blocklist?
 *
 * Returns a bare boolean and nothing else — not which entry matched, not how
 * close it was. Those would turn the function into a gradient to climb.
 *
 * A sequential scan over the blocklist, which is right while it holds
 * thousands of rows and wrong once it holds millions. At that point this
 * wants multi-index hashing — the hash split into chunks, with an exact index
 * on each — and the signature here does not have to change for it.
 */
create or replace function public.is_media_blocked(p_hash bit)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.blocked_media b
    where bit_count(b.hash # p_hash) <= public.media_match_distance()
  );
$function$;

revoke all on function public.is_media_blocked(bit) from public, anon;
grant execute on function public.is_media_blocked(bit) to authenticated;

/**
 * Record what an upload hashed to, and say whether it may be used.
 *
 * One call does both so a client cannot record a fingerprint for one picture
 * and post another: the row that is written is the hash that was judged.
 *
 * Returns true when the picture is blocked. The caller deletes the uploaded
 * object and tells the person, in words that do not describe the rule.
 */
create or replace function public.claim_media(
  p_target_type text,
  p_target_id uuid,
  p_url text,
  p_hash bit
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  blocked boolean;
begin
  if p_target_type not in ('post', 'shot', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  blocked := public.is_media_blocked(p_hash);

  -- Recorded either way. A refused attempt is the more interesting of the
  -- two: a person who keeps trying to post something already removed is a
  -- pattern worth being able to see.
  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, p_hash, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

revoke all on function public.claim_media(text, uuid, text, bit) from public, anon;
grant execute on function public.claim_media(text, uuid, text, bit) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- The loop: removing content blocks it being posted again
-- ─────────────────────────────────────────────────────────────────────────

/**
 * Harvest the fingerprints of something that has just been removed.
 *
 * Only on the transition into removed. Re-running an update on an
 * already-removed row must not keep re-adding, and un-removing something
 * deliberately does NOT un-block it — that is a moderator decision, made by
 * deleting the blocklist row, not a side effect of restoring a post.
 */
create or replace function public.tg_harvest_removed_media()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  kind text := tg_argv[0];
begin
  if new.removed_at is null or old.removed_at is not null then
    return new;
  end if;

  insert into public.blocked_media (hash, source, note, added_by)
  select f.hash, 'takedown', kind || ' ' || new.id::text, new.removed_by
  from public.media_fingerprints f
  where f.target_type = kind and f.target_id = new.id
  on conflict (hash) do nothing;

  return new;
end;
$function$;

drop trigger if exists posts_harvest_removed_media on public.posts;
create trigger posts_harvest_removed_media
  after update of removed_at on public.posts
  for each row execute function public.tg_harvest_removed_media('post');

drop trigger if exists shots_harvest_removed_media on public.shots;
create trigger shots_harvest_removed_media
  after update of removed_at on public.shots
  for each row execute function public.tg_harvest_removed_media('shot');

drop trigger if exists comments_harvest_removed_media on public.comments;
create trigger comments_harvest_removed_media
  after update of removed_at on public.comments
  for each row execute function public.tg_harvest_removed_media('comment');
