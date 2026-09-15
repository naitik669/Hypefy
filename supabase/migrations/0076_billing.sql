-- Paid features: Verified (₹99/month), Hypefy Premium (₹125/month, badge
-- included, one free month), and a Shop of one-off items.
--
-- What someone has paid for lives in two tables nobody can write to from the
-- app: subscriptions (plans) and purchases (Shop items). Payment webhooks and
-- admins write them with the service role; a trigger turns them into the two
-- profile flags every screen already reads. So the badge, which is drawn from
-- profiles.is_verified on a dozen surfaces, needs no UI change to start
-- appearing for people who pay.

-- 1. The catalogue. Prices live here so they change without a deploy; how an
--    item looks lives in code, keyed by the same id.
create table if not exists public.products (
  id text primary key,
  kind text not null check (kind in (
    'chat_theme', 'avatar_decoration', 'profile_theme', 'name_font', 'name_glow', 'app_icon'
  )),
  tier text not null check (tier in ('free', 'premium', 'shop')),
  name text not null,
  -- Shop items only. Paise, so ₹49 is 4900.
  price_paise integer check (price_paise is null or price_paise > 0),
  active boolean not null default true,
  sort integer not null default 0,
  check ((tier = 'shop') = (price_paise is not null))
);
alter table public.products enable row level security;

drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (true);

revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;

-- 2. Plans. One row per subscription with a payment provider; 'manual' rows
--    are grants by us (comps, testing, admin verification).
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('verified', 'premium')),
  status text not null default 'pending' check (status in (
    'pending', 'trialing', 'active', 'past_due', 'cancelled', 'expired'
  )),
  provider text not null check (provider in ('razorpay', 'google', 'apple', 'manual')),
  provider_ref text unique,
  -- Set once the trial is real (checkout completed), never on a pending row,
  -- so opening checkout and walking away does not use up the free month.
  trial_ends_at timestamptz,
  -- Null means no end (manual grants).
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_own on public.subscriptions;
create policy subscriptions_own on public.subscriptions
  for select using ((select auth.uid()) = user_id);

revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- 3. Shop purchases: yours forever.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.products(id),
  provider text not null check (provider in ('razorpay', 'google', 'apple', 'manual')),
  provider_ref text unique,
  amount_paise integer,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
alter table public.purchases enable row level security;

drop policy if exists purchases_own on public.purchases;
create policy purchases_own on public.purchases
  for select using ((select auth.uid()) = user_id);

revoke all on public.purchases from anon, authenticated;
grant select on public.purchases to authenticated;

-- 4. Webhook deliveries already handled. Providers retry, so the same event
--    can arrive more than once; its id is recorded before it is acted on.
create table if not exists public.billing_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- 5. Profile flags and the cosmetics you pick.
alter table public.profiles
  add column if not exists is_premium boolean not null default false,
  -- An admin took the badge away (impersonation). Wins over any plan.
  add column if not exists badge_revoked boolean not null default false,
  add column if not exists name_font text,
  add column if not exists name_glow text,
  add column if not exists avatar_decoration text;

-- Yours to choose; the trigger below checks you own what you choose.
grant update (name_font, name_glow, avatar_decoration) on public.profiles to authenticated;

-- is_premium and badge_revoked join the columns only the trusted path writes.
--
-- Now SECURITY INVOKER. As a definer function, current_user inside it was
-- always its owner (postgres), so the "trusted caller" check below passed for
-- everyone and the trigger preserved nothing. The column grants were what
-- actually held; this makes the belt real too. Definer functions that write
-- profiles (sync_entitlements, set_verified, admin RPCs) still run as their
-- owner, so they still pass.
create or replace function public.tg_profiles_preserve_privileged()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.id                := old.id;
  new.is_admin          := old.is_admin;
  new.is_verified       := old.is_verified;
  new.is_premium        := old.is_premium;
  new.badge_revoked     := old.badge_revoked;
  new.referred_by       := old.referred_by;
  new.created_at        := old.created_at;
  new.date_of_birth     := old.date_of_birth;
  new.suspended_at      := old.suspended_at;
  new.suspended_until   := old.suspended_until;
  new.suspension_reason := old.suspension_reason;
  new.suspended_by      := old.suspended_by;
  return new;
end $function$;

-- 6. Ownership. Free items are everyone's; Premium items are yours while you
--    have Premium; Shop items are yours once bought.
create or replace function public.owns_product(p_uid uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select case p.tier
      when 'free' then true
      when 'premium' then coalesce((select pr.is_premium from public.profiles pr where pr.id = p_uid), false)
      else exists (select 1 from public.purchases b where b.user_id = p_uid and b.product_id = p.id)
    end
    from public.products p
    where p.id = p_product and p.active
  ), false);
$function$;

revoke all on function public.owns_product(uuid, text) from public, anon;
grant execute on function public.owns_product(uuid, text) to authenticated, service_role;

-- You can only wear what you own. The new cosmetic columns take catalogue ids
-- only; banners and accents predate the catalogue, so an id that is not in it
-- (every existing free banner) is let through.
-- Invoker for the same reason as the trigger above: it must see who is
-- really writing.
create or replace function public.tg_profiles_cosmetics_owned()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_col text;
  v_val text;
  v_kind text;
  v_want text;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  foreach v_col in array array['name_font', 'name_glow', 'avatar_decoration', 'banner_id'] loop
    v_val := case v_col
      when 'name_font' then new.name_font
      when 'name_glow' then new.name_glow
      when 'avatar_decoration' then new.avatar_decoration
      else new.banner_id
    end;
    if v_val is null or v_val is not distinct from (case v_col
      when 'name_font' then old.name_font
      when 'name_glow' then old.name_glow
      when 'avatar_decoration' then old.avatar_decoration
      else old.banner_id
    end) then
      continue;
    end if;

    v_want := case v_col
      when 'name_font' then 'name_font'
      when 'name_glow' then 'name_glow'
      when 'avatar_decoration' then 'avatar_decoration'
      else 'profile_theme'
    end;
    select kind into v_kind from public.products where id = v_val;

    if v_kind is null then
      if v_col = 'banner_id' then continue; end if;
      raise exception 'Unknown item';
    end if;
    if v_kind <> v_want then raise exception 'Wrong kind of item'; end if;
    if not public.owns_product(new.id, v_val) then raise exception 'Not unlocked'; end if;
  end loop;
  return new;
end $function$;

revoke all on function public.tg_profiles_cosmetics_owned() from public, anon, authenticated;

drop trigger if exists profiles_cosmetics_owned on public.profiles;
create trigger profiles_cosmetics_owned
  before update of name_font, name_glow, avatar_decoration, banner_id on public.profiles
  for each row execute function public.tg_profiles_cosmetics_owned();

-- 7. Plans → profile flags. A plan counts while it is trialing, active, or
--    retrying a failed payment, and for three days past its period end: a
--    renewal is charged at the end of the period and its webhook can take a
--    while, and the badge should not blink off in between.
create or replace function public.sync_entitlements(p_uid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_premium boolean;
  v_verified boolean;
begin
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_uid and s.plan = 'premium'
      and s.status in ('trialing', 'active', 'past_due')
      and (s.current_period_end is null or s.current_period_end + interval '3 days' > now())
  ) into v_premium;

  select (v_premium or exists (
    select 1 from public.subscriptions s
    where s.user_id = p_uid and s.plan = 'verified'
      and s.status in ('trialing', 'active', 'past_due')
      and (s.current_period_end is null or s.current_period_end + interval '3 days' > now())
  )) and not coalesce((select badge_revoked from public.profiles where id = p_uid), false)
  into v_verified;

  update public.profiles
     set is_premium = v_premium, is_verified = v_verified
   where id = p_uid
     and (is_premium is distinct from v_premium or is_verified is distinct from v_verified);
end $function$;

revoke all on function public.sync_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.sync_entitlements(uuid) to service_role;

create or replace function public.tg_subscriptions_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $function$;

create or replace function public.tg_subscriptions_after()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.sync_entitlements(coalesce(new.user_id, old.user_id));
  return null;
end $function$;

revoke all on function public.tg_subscriptions_sync() from public, anon, authenticated;
revoke all on function public.tg_subscriptions_after() from public, anon, authenticated;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.tg_subscriptions_sync();

drop trigger if exists subscriptions_entitlements on public.subscriptions;
create trigger subscriptions_entitlements after insert or update or delete on public.subscriptions
  for each row execute function public.tg_subscriptions_after();

-- 8. One free month per person, ever. Only a trial that actually started
--    counts (pending rows never carry trial_ends_at).
create or replace function public.trial_eligible(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select not exists (
    select 1 from public.subscriptions
    where user_id = p_uid and plan = 'premium' and trial_ends_at is not null
  );
$function$;

revoke all on function public.trial_eligible(uuid) from public, anon;
grant execute on function public.trial_eligible(uuid) to authenticated, service_role;

-- 9. Admin verification now goes through the same path. Granting adds a
--    manual plan; revoking also sets badge_revoked, which beats Premium, so a
--    paying impersonator loses the badge without losing the rest of Premium.
create or replace function public.set_verified(p_user_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_value then
    update public.profiles set badge_revoked = false where id = p_user_id;
    if not exists (
      select 1 from public.subscriptions
      where user_id = p_user_id and plan = 'verified' and provider = 'manual' and status = 'active'
    ) then
      insert into public.subscriptions (user_id, plan, status, provider)
      values (p_user_id, 'verified', 'active', 'manual');
    end if;
  else
    update public.profiles set badge_revoked = true where id = p_user_id;
    update public.subscriptions set status = 'cancelled'
     where user_id = p_user_id and plan = 'verified' and provider = 'manual' and status = 'active';
  end if;
  perform public.sync_entitlements(p_user_id);
end $function$;

revoke execute on function public.set_verified(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_verified(uuid, boolean) to service_role;

-- 10. A missed webhook must not leave someone on a plan forever. Once a
--     period is three days gone, the plan is over.
create or replace function public.expire_lapsed_subscriptions()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.subscriptions
     set status = 'expired'
   where status in ('trialing', 'active', 'past_due')
     and current_period_end is not null
     and current_period_end + interval '3 days' < now();

  -- Checkouts opened and never finished.
  update public.subscriptions
     set status = 'expired'
   where status = 'pending' and created_at < now() - interval '1 day';
$function$;

revoke all on function public.expire_lapsed_subscriptions() from public, anon, authenticated;

select cron.unschedule('expire-lapsed-subscriptions')
 where exists (select 1 from cron.job where jobname = 'expire-lapsed-subscriptions');
select cron.schedule('expire-lapsed-subscriptions', '15 3 * * *', 'select public.expire_lapsed_subscriptions();');

-- 11. The launch catalogue.
insert into public.products (id, kind, tier, name, price_paise, sort) values
  -- Name fonts (Premium)
  ('font-script',  'name_font', 'premium', 'Script',  null, 1),
  ('font-block',   'name_font', 'premium', 'Block',   null, 2),
  ('font-retro',   'name_font', 'premium', 'Retro',   null, 3),
  ('font-marker',  'name_font', 'premium', 'Marker',  null, 4),
  ('font-pixel',   'name_font', 'premium', 'Pixel',   null, 5),
  ('font-classic', 'name_font', 'premium', 'Classic', null, 6),
  -- Name glows (Premium)
  ('glow-lime',   'name_glow', 'premium', 'Lime',   null, 1),
  ('glow-blue',   'name_glow', 'premium', 'Blue',   null, 2),
  ('glow-pink',   'name_glow', 'premium', 'Pink',   null, 3),
  ('glow-gold',   'name_glow', 'premium', 'Gold',   null, 4),
  ('glow-violet', 'name_glow', 'premium', 'Violet', null, 5),
  ('glow-ice',    'name_glow', 'premium', 'Ice',    null, 6),
  -- Avatar decorations
  ('deco-halo',    'avatar_decoration', 'premium', 'Halo',    null, 1),
  ('deco-sparkle', 'avatar_decoration', 'premium', 'Sparkle', null, 2),
  ('deco-neon',    'avatar_decoration', 'premium', 'Neon',    null, 3),
  ('deco-flames',  'avatar_decoration', 'shop',    'Flames',  4900, 4),
  ('deco-crown',   'avatar_decoration', 'shop',    'Crown',   4900, 5),
  ('deco-hearts',  'avatar_decoration', 'shop',    'Hearts',  4900, 6),
  -- Chat themes
  ('theme-midnight', 'chat_theme', 'free',    'Midnight', null, 1),
  ('theme-lime',     'chat_theme', 'free',    'Lime',     null, 2),
  ('theme-ocean',    'chat_theme', 'free',    'Ocean',    null, 3),
  ('theme-pond',     'chat_theme', 'premium', 'Pond',     null, 4),
  ('theme-sakura',   'chat_theme', 'premium', 'Sakura',   null, 5),
  ('theme-galaxy',   'chat_theme', 'premium', 'Galaxy',   null, 6),
  ('theme-sunset',   'chat_theme', 'premium', 'Sunset',   null, 7),
  ('theme-arcade',   'chat_theme', 'shop',    'Arcade',   7900, 8),
  ('theme-candy',    'chat_theme', 'shop',    'Candy',    7900, 9),
  -- Profile themes (banners) beyond the free six
  ('banner-aurora', 'profile_theme', 'premium', 'Aurora',   null, 1),
  ('banner-gold',   'profile_theme', 'premium', 'Gold Rush', null, 2),
  ('banner-holo',   'profile_theme', 'premium', 'Holo',     null, 3)
on conflict (id) do nothing;
