-- @mentioning someone in a Show now reaches them.
--
-- It never has. The composer runs the same mention typeahead a Shot gets
-- (useMentionHashtag in ShotPreview), so the writer picks a name out of a
-- dropdown and watches it go into the caption — and then the insert sends
-- `user_id, media_url, caption, track` and the mention is simply gone.
-- There is no column for it.
--
-- Posts have had `mentions` and a trigger since the baseline; Shots got
-- theirs in 0102, which was written because 0025 had "fixed" the same gap
-- by deleting mention_shot from the UI filter instead of adding the
-- column. This is the third and last of the three.
--
-- Nothing on the read side changes: the notifications screen routes
-- target_type 'show' to /shows/<id> already, and files every mention_%
-- type under the "mentions" Tune level.

alter table public.shows
  add column if not exists mentions text[] not null default '{}';

comment on column public.shows.mentions is
  'Usernames @mentioned in the caption, lowercased. Drives mention_show notifications.';

-- 0150 revoked column-wide insert and grants one column at a time, so a
-- new column is unwritable by the client until it is named here. The
-- existing grant is replaced wholesale: a second `grant insert (...)`
-- adds to the set rather than replacing it, but stating the full list
-- keeps this readable against 0150.
grant insert (user_id, media_url, caption, track, linked_post_id, mentions)
  on public.shows to authenticated;

create or replace function public.handle_show_mentions()
returns trigger language plpgsql security definer as $$
declare
  v_mention text;
  v_target uuid;
begin
  if new.mentions is null then return new; end if;
  foreach v_mention in array new.mentions loop
    -- Mentioning yourself is not a notification.
    select id into v_target from public.profiles
      where lower(username) = lower(v_mention) and id <> new.user_id;
    if v_target is not null then
      insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
      values (v_target, new.user_id, 'mention_show', 'show', new.id, 'mentioned you in a Show')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

alter function public.handle_show_mentions() set search_path = public;

-- Trigger functions are not an API. 0052 revoked execute on every one of
-- these from the client roles; this one joins them rather than being the
-- single exception.
revoke execute on function public.handle_show_mentions() from public, anon, authenticated;

drop trigger if exists on_show_mentions on public.shows;
create trigger on_show_mentions after insert on public.shows
  for each row execute function public.handle_show_mentions();
