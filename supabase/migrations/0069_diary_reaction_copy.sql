-- Diary: a reaction to one now says so.
--
-- The notes table is unchanged — Diary is the new surface for the same 24-hour
-- note, one per person. The only thing that named the old surface was the
-- notification a reaction sends, which read "reacted ❤️ to your status" and
-- pointed at a status bubble that is switched off. Same function, same checks
-- and the same once-only notification; only the word changes.
--
-- Existing notifications keep their old text. They describe what happened at
-- the time, and rewriting history to match a rename is not this migration's job.

create or replace function public.react_to_note(p_owner uuid, p_emoji text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid := (select auth.uid()); v_created timestamptz; v_had boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if char_length(coalesce(p_emoji, '')) = 0 then raise exception 'No emoji'; end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_uid and b.blocked_id = p_owner)
       or (b.blocker_id = p_owner and b.blocked_id = v_uid)
  ) then raise exception 'Blocked'; end if;

  select created_at into v_created from public.notes where user_id = p_owner and expires_at > now();
  if v_created is null then raise exception 'No active note'; end if;

  select exists (
    select 1 from public.note_reactions where note_owner_id = p_owner and reactor_id = v_uid
  ) into v_had;

  insert into public.note_reactions (note_owner_id, reactor_id, emoji, note_created_at)
  values (p_owner, v_uid, p_emoji, v_created)
  on conflict (note_owner_id, reactor_id)
  do update set emoji = excluded.emoji, note_created_at = excluded.note_created_at;

  if not v_had then
    insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
    values (p_owner, v_uid, 'note_reaction', 'profile', p_owner, 'reacted ' || p_emoji || ' to your Diary');
  end if;
end $function$;
