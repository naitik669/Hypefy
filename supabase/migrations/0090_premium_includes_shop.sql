-- Premium includes the Shop.
--
-- Shop items (frames, bubbles, nameplates, chat themes) were one-off purchases
-- for everyone, so a Premium member opening the Marketplace was asked to buy
-- most of it. Premium now unlocks them too; buying one still keeps it for good.
--
-- Because a Premium member can now wear a Shop item they never bought, ending
-- Premium has to take those off again: sync_entitlements clears any worn Shop
-- item that was not purchased. Premium-tier items need no such step, since
-- they already stop showing once is_premium is false.

create or replace function public.owns_product(p_uid uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select case p.tier
      when 'free' then true
      when 'premium' then coalesce((select pr.is_premium from public.profiles pr where pr.id = p_uid), false)
      else coalesce((select pr.is_premium from public.profiles pr where pr.id = p_uid), false)
        or exists (select 1 from public.purchases b where b.user_id = p_uid and b.product_id = p.id)
    end
    from public.products p
    where p.id = p_product and p.active
  ), false);
$$;

/** A Shop item this person is wearing without having bought it. */
create or replace function public.worn_without_purchase(p_uid uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_product is not null
    and exists (select 1 from public.products p where p.id = p_product and p.tier = 'shop')
    and not exists (select 1 from public.purchases b where b.user_id = p_uid and b.product_id = p_product);
$$;

create or replace function public.sync_entitlements(p_uid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- Without Premium, Shop items it had unlocked come off.
  if not v_premium then
    update public.profiles pr
       set avatar_decoration = case when public.worn_without_purchase(p_uid, pr.avatar_decoration) then null else pr.avatar_decoration end,
           bubble_style = case when public.worn_without_purchase(p_uid, pr.bubble_style) then null else pr.bubble_style end,
           nameplate = case when public.worn_without_purchase(p_uid, pr.nameplate) then null else pr.nameplate end
     where pr.id = p_uid
       and (public.worn_without_purchase(p_uid, pr.avatar_decoration)
         or public.worn_without_purchase(p_uid, pr.bubble_style)
         or public.worn_without_purchase(p_uid, pr.nameplate));
  end if;
end $$;

revoke all on function public.worn_without_purchase(uuid, text) from public, anon, authenticated;
