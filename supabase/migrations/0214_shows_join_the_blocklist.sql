-- A Show is checked against the blocklist, and harvested when taken down.
--
-- 0157 built the perceptual-hash blocklist and wired it to posts, shots,
-- comments and messages. Shows were left out, and every other part of the
-- chain already handles them: reports accept 'show' (0048) and
-- admin_remove_content maps 'show' to the shows table (0055). The only
-- missing links are the two in the middle — claim_media refuses the type,
-- and no trigger harvests a removed Show's hashes.
--
-- So today a picture a moderator took down from a post can be put straight
-- back up as a Show, and taking down that Show teaches the blocklist
-- nothing. Three statements close both ends.
--
-- Showcases are deliberately NOT added. A Showcase cannot be removed by a
-- moderator at all — admin_remove_content has no case for it and reports
-- cannot target it — so there is nothing for a fingerprint on one to be
-- harvested by. The upload-time check still runs on a Showcase upload,
-- because that needs no row of its own. Making Showcases removable is its
-- own piece of work, and claiming fingerprints for them first would be
-- recording evidence for a takedown that cannot happen.

alter table public.media_fingerprints
  drop constraint if exists media_fingerprints_target_type_check;

alter table public.media_fingerprints
  add constraint media_fingerprints_target_type_check
  check (target_type in ('post', 'shot', 'show', 'comment', 'message'));

-- Unchanged but for the one list. Restated in full rather than patched,
-- because this is the third definition of it (0157, 0158) and a reader
-- should not have to assemble the current one from three files.
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
  if p_target_type not in ('post', 'shot', 'show', 'comment', 'message') then
    raise exception 'unknown target type';
  end if;

  bits := public.media_hash_bits(p_hash);
  if bits is null then
    return false;
  end if;

  blocked := public.is_media_blocked(bits);

  insert into public.media_fingerprints (target_type, target_id, url, hash, user_id)
  values (p_target_type, p_target_id, p_url, bits, (select auth.uid()))
  on conflict (target_type, target_id, url) do update set hash = excluded.hash;

  return blocked;
end;
$function$;

-- The other end: a Show a moderator removes puts its hashes on the
-- blocklist, the same way a post has since 0157. The function is already
-- written and already takes the kind as an argument.
drop trigger if exists shows_harvest_removed_media on public.shows;
create trigger shows_harvest_removed_media
  after update of removed_at on public.shows
  for each row execute function public.tg_harvest_removed_media('show');
