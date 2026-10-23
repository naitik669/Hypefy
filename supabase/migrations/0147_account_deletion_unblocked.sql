-- Make deleting an account actually work.
--
-- /api/account/delete removes the person's storage objects first and then
-- calls auth.admin.deleteUser. The delete was failing, so people were left
-- with their media gone and their account still there — the worst of both,
-- and silent. Working deletion is also a hard requirement of both app stores
-- and of privacy law.
--
-- Two independent causes, both proved on the live database in a rolled-back
-- transaction before this was written.
--
-- 1. Three foreign keys to profiles are NO ACTION where every comparable one
--    cascades (reports and message_reports both ON DELETE CASCADE). So any
--    user who had been moderated or suspended, or who had ever acted as an
--    admin, could not be deleted.
--
--    SET NULL rather than CASCADE: a moderation log that deletes itself when
--    the moderator leaves is not a log. The action, reason and target stay;
--    only the pointer to a person who no longer exists goes.
--
-- 2. The diary archive trigger blocked it for ORDINARY users, which is the
--    worse half. Deleting a profile cascades to the person's notes;
--    archive_diary fires BEFORE DELETE on each one and inserts into
--    diary_archive using old.user_id — whose profile row is already gone, so
--    diary_archive_user_id_fkey rejects it and the whole delete aborts.
--
--    Anyone who had ever written a diary page could not delete their account.
--
--    The guard below is the honest reading of what the archive is for: it
--    keeps a page for the person who wrote it. There is nobody left to keep
--    it for, and diary_archive would cascade away in the same statement
--    regardless.

-- ── 1. The three foreign keys ─────────────────────────────────────────────

alter table public.moderation_actions alter column actor_id drop not null;

alter table public.moderation_actions
  drop constraint moderation_actions_actor_id_fkey,
  add constraint moderation_actions_actor_id_fkey
    foreign key (actor_id) references public.profiles(id) on delete set null;

alter table public.moderation_actions
  drop constraint moderation_actions_target_user_id_fkey,
  add constraint moderation_actions_target_user_id_fkey
    foreign key (target_user_id) references public.profiles(id) on delete set null;

alter table public.profiles
  drop constraint profiles_suspended_by_fkey,
  add constraint profiles_suspended_by_fkey
    foreign key (suspended_by) references public.profiles(id) on delete set null;

-- ── 2. Do not archive a page for an account that is going ─────────────────

create or replace function public.archive_diary()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_how text;
begin
  -- The owner is being deleted and the cascade is already past profiles, so
  -- an archive row for them cannot satisfy its foreign key — and would be
  -- cascaded away in this same statement even if it could.
  if not exists (select 1 from public.profiles where id = old.user_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    if new.created_at = old.created_at then
      return new;
    end if;
    v_how := case when old.expires_at <= now() then 'expired' else 'replaced' end;
  else
    v_how := case when old.expires_at <= now() then 'expired' else 'taken_down' end;
  end if;

  insert into public.diary_archive (user_id, text, audience, track, color, image_url, written_at, ended_how)
  values (old.user_id, old.text, old.audience, old.track, old.color, old.image_url, old.created_at, v_how)
  on conflict (user_id, written_at) do nothing;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
