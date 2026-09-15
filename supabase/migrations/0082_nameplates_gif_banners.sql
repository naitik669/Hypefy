-- Nameplates, and animated banners for Premium in place of Premium banners.
--
-- A nameplate is artwork behind your row in other people's Messages list,
-- the way Discord's are. It belongs to a person, like a bubble style, and is
-- checked by the same ownership trigger. Premium ones show while you have
-- Premium; Marketplace ones are yours for good.
--
-- The three gradient Premium banners are retired: anyone can upload their
-- own banner. What Premium adds instead is a GIF banner. Nobody was wearing
-- or had bought a Premium banner.

-- ── Nameplates ────────────────────────────────────────────────────────────
alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check check (kind in (
  'chat_theme', 'avatar_decoration', 'profile_theme', 'name_font', 'name_glow', 'app_icon', 'bubble_style', 'nameplate'
));

alter table public.profiles add column if not exists nameplate text;
grant update (nameplate) on public.profiles to authenticated;

create or replace function public.tg_profiles_cosmetics_owned()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_col text;
  v_val text;
  v_old text;
  v_kind text;
  v_want text;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  foreach v_col in array array['name_font', 'name_glow', 'avatar_decoration', 'banner_id', 'bubble_style', 'nameplate'] loop
    v_val := case v_col
      when 'name_font' then new.name_font
      when 'name_glow' then new.name_glow
      when 'avatar_decoration' then new.avatar_decoration
      when 'bubble_style' then new.bubble_style
      when 'nameplate' then new.nameplate
      else new.banner_id
    end;
    v_old := case v_col
      when 'name_font' then old.name_font
      when 'name_glow' then old.name_glow
      when 'avatar_decoration' then old.avatar_decoration
      when 'bubble_style' then old.bubble_style
      when 'nameplate' then old.nameplate
      else old.banner_id
    end;
    if v_val is null or v_val is not distinct from v_old then
      continue;
    end if;

    v_want := case v_col when 'banner_id' then 'profile_theme' else v_col end;
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

drop trigger if exists profiles_cosmetics_owned on public.profiles;
create trigger profiles_cosmetics_owned
  before update of name_font, name_glow, avatar_decoration, banner_id, bubble_style, nameplate on public.profiles
  for each row execute function public.tg_profiles_cosmetics_owned();

insert into public.products (id, kind, tier, name, price_paise, sort) values
  ('plate-lime',    'nameplate', 'premium', 'Lime Rush',    null, 1),
  ('plate-petals',  'nameplate', 'premium', 'Petal Drift',  null, 2),
  ('plate-starfall','nameplate', 'premium', 'Starfall',     null, 3),
  ('plate-aurora',  'nameplate', 'premium', 'Aurora',       null, 4),
  ('plate-wisp',    'nameplate', 'premium', 'Will-o''-wisp', null, 5),
  ('plate-ember',   'nameplate', 'shop',    'Ember',        7900, 6),
  ('plate-sakura',  'nameplate', 'shop',    'Sakura',       9900, 7),
  ('plate-city',    'nameplate', 'shop',    'Neon City',    9900, 8),
  ('plate-hearts',  'nameplate', 'shop',    'Pixel Hearts', 5900, 9),
  ('plate-ocean',   'nameplate', 'shop',    'Deep Blue',    7900, 10)
on conflict (id) do nothing;

-- ── Premium banners out ───────────────────────────────────────────────────
update public.profiles set banner_id = null where banner_id in ('banner-aurora', 'banner-gold', 'banner-holo');
delete from public.products p
  where p.id in ('banner-aurora', 'banner-gold', 'banner-holo')
    and not exists (select 1 from public.purchases where product_id = p.id);

-- ── GIF banners for Premium ───────────────────────────────────────────────
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  where id = 'banners';

-- Only Premium members may put a GIF in the banners bucket.
drop policy if exists banners_gif_premium_insert on storage.objects;
create policy banners_gif_premium_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'banners'
    or lower(name) not like '%.gif'
    or exists (select 1 from public.profiles where id = auth.uid() and is_premium)
  );

drop policy if exists banners_gif_premium_update on storage.objects;
create policy banners_gif_premium_update on storage.objects
  as restrictive for update to authenticated
  with check (
    bucket_id <> 'banners'
    or lower(name) not like '%.gif'
    or exists (select 1 from public.profiles where id = auth.uid() and is_premium)
  );

-- And only a Premium member may set one as their banner.
create or replace function public.tg_profiles_gif_banner()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.banner_url is distinct from old.banner_url
     and new.banner_url ~* '\.gif(\?|$)'
     and not coalesce(new.is_premium, false) then
    raise exception 'Animated banners come with Premium';
  end if;
  return new;
end $function$;

drop trigger if exists profiles_gif_banner on public.profiles;
create trigger profiles_gif_banner
  before update of banner_url on public.profiles
  for each row execute function public.tg_profiles_gif_banner();
