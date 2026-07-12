-- Tracked invites: share links carry ?ref=<username>; on signup the invitee
-- claims the referral once, crediting the inviter with a notification.

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

-- Who joined via my link (settings counter).
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;

-- One-shot claim: resolves the username, refuses self/unknown referrers,
-- only sets referred_by when still null, and only for fresh accounts (7 days)
-- so old users can't be "claimed" retroactively. Notifies the inviter.
create or replace function public.claim_referral(p_ref_username text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := (select auth.uid());
  v_ref uuid;
begin
  if v_me is null or coalesce(trim(p_ref_username), '') = '' then
    return false;
  end if;

  select id into v_ref from public.profiles where username = lower(trim(p_ref_username));
  if v_ref is null or v_ref = v_me then
    return false;
  end if;

  update public.profiles
     set referred_by = v_ref
   where id = v_me
     and referred_by is null
     and created_at > now() - interval '7 days';
  if not found then
    return false;
  end if;

  insert into public.notifications (user_id, actor_id, type, target_type, target_id, body)
  values (v_ref, v_me, 'referral_joined', 'profile', v_me, 'joined Hypefy from your invite 🎉');

  return true;
end;
$$;
