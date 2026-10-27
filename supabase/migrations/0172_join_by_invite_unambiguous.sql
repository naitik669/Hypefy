-- join_by_invite, without an output column that shadows a real one.
--
-- 0170 declared `returns table (conversation_id uuid, outcome text)`, and
-- inside the body every bare `conversation_id` then meant two things at
-- once. Postgres refused at the first call: "column reference is
-- ambiguous". Valid DDL, broken function — the same shape of mistake as
-- the pgcrypto one in 0171, caught the same way.
--
-- One jsonb object instead of two output columns. There is nothing left to
-- shadow, and the caller reads one thing rather than a one-row set.
create or replace function public.join_by_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_conv uuid; v_needs boolean; v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Sign in first';
  end if;

  select i.conversation_id, i.requires_approval into v_conv, v_needs
    from public.conversation_invites i
   where i.code = btrim(coalesce(p_code, ''));

  if v_conv is null then
    raise exception 'That link does not work any more';
  end if;

  if exists (
    select 1 from public.conversation_members m
     where m.conversation_id = v_conv and m.user_id = v_me
  ) then
    return jsonb_build_object('conversation_id', v_conv, 'outcome', 'already');
  end if;

  -- Blocks count in both directions. A link is a way around not knowing
  -- somebody's handle; it is not a way around having been blocked by one
  -- of them. The message is the same as a dead link on purpose — telling
  -- a stranger they have been blocked is telling them something.
  if exists (
    select 1
      from public.conversation_members cm
      join public.blocked_users b
        on (b.blocker_id = cm.user_id and b.blocked_id = v_me)
        or (b.blocker_id = v_me and b.blocked_id = cm.user_id)
     where cm.conversation_id = v_conv
  ) then
    raise exception 'That link does not work any more';
  end if;

  if v_needs then
    insert into public.conversation_join_requests as jr (conversation_id, user_id)
    values (v_conv, v_me)
    on conflict (conversation_id, user_id) do nothing;
    return jsonb_build_object('conversation_id', v_conv, 'outcome', 'pending');
  end if;

  insert into public.conversation_members as cm (conversation_id, user_id, role)
  values (v_conv, v_me, 'member')
  on conflict do nothing;
  return jsonb_build_object('conversation_id', v_conv, 'outcome', 'joined');
end $$;

revoke all on function public.join_by_invite(text) from public, anon;
grant execute on function public.join_by_invite(text) to authenticated;
