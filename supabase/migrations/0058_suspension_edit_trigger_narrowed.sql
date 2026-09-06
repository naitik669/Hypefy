-- Fixes an over-broad trigger from 0057.
--
-- 0057 attached tg_block_suspended to UPDATE on the five content tables. That
-- was far too wide: those tables are updated constantly on OTHER people's
-- behalf by counter triggers and definer RPCs — bump_post_save_count,
-- increment_post_view, bump_share_count, the comment counters — and the check
-- looks at the CALLER, not at whose row it is. So a suspended user saving
-- somebody's post, or merely VIEWING one, tripped "Your account is suspended."
-- while doing something entirely passive.
--
-- Caught by the verification probe rather than by reading the code: the test
-- said a private save was blocked when the design said it should not be, and
-- the cascade was the reason.
--
-- The real rule is narrower. Block an update only when the row belongs to the
-- suspended caller AND something other than a machine-written counter actually
-- changed. Comparing the rows as jsonb minus the ignored keys keeps one
-- function correct across five tables with different columns, so it cannot
-- drift as columns get added.

create or replace function public.tg_block_suspended_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ignore text[] := array[
    'hype_count','view_count','save_count','share_count','comment_count',
    'repost_count','reply_count','updated_at',
    -- Written by the system or by a moderator, never by the suspended user
    -- editing their own words.
    'removed_at','removed_by','removal_reason','deleted_at',
    'is_unsent','unsent_at','edited_at'
  ];
  v_new jsonb := to_jsonb(new);
  v_owner uuid;
begin
  v_owner := case
    when v_new ? 'user_id'   then nullif(v_new->>'user_id','')::uuid
    when v_new ? 'sender_id' then nullif(v_new->>'sender_id','')::uuid
    else null end;

  -- Somebody else's row, or a system counter bump: not this user's edit.
  if v_owner is distinct from (select auth.uid()) then return new; end if;
  if not public.is_suspended() then return new; end if;

  if (v_new - v_ignore) is distinct from (to_jsonb(old) - v_ignore) then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.tg_block_suspended_edit() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['posts','comments','messages','shows','shots'] loop
    execute format('drop trigger if exists block_suspended_update on public.%I', t);
    execute format(
      'create trigger block_suspended_update before update on public.%I
         for each row execute function public.tg_block_suspended_edit()', t);
  end loop;
end $$;
