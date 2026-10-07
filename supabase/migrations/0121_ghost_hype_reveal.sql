-- Hyping something that was Ghost Shared to you lets a ghost out.
--
-- Until now a placed Shot or post was never marked, at any point. This is
-- the one exception, and it is the recipient's own doing: when they hype it,
-- the app asks this, and a yes plays a small ghost rising off the star.
--
-- What it gives away: that someone placed this for you. Never who. And only
-- after you liked it enough to hype it; nothing on the page says so before.
-- The sender is still told nothing.
--
-- Once per placement: the first yes is recorded in hyped_at and every later
-- call answers no, so taking the hype back and giving it again does not
-- replay it. The app asks after every hype, of anything, so the question
-- itself says nothing about the thing being hyped.

alter table public.ghost_shares add column if not exists hyped_at timestamptz;

create or replace function public.ghost_hype_reveal(p_kind text, p_content_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or p_kind not in ('post', 'shot') or not public.ghost_share_enabled() then
    return false;
  end if;
  -- Only for a hype that is really there: asking is not a way to find out.
  if not exists (select 1 from public.hypes h
                  where h.user_id = v_uid and h.target_type = p_kind and h.target_id = p_content_id) then
    return false;
  end if;
  update public.ghost_shares g set hyped_at = now()
   where g.id = (select s.id from public.ghost_shares s
                  where s.recipient_id = v_uid and s.kind = p_kind
                    and coalesce(s.post_id, s.shot_id) = p_content_id
                    and s.delivered_at is not null and s.cancelled_at is null
                    and s.hyped_at is null
                    and s.delivered_at > now() - interval '7 days'
                  order by s.delivered_at desc limit 1
                  for update skip locked)
  returning g.id into v_id;
  return v_id is not null;
end $$;

revoke all on function public.ghost_hype_reveal(text, uuid) from public, anon;
grant execute on function public.ghost_hype_reveal(text, uuid) to authenticated;
