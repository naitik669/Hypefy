-- Bubble styles: how YOUR messages look, in every chat.
--
-- A chat theme belongs to a conversation; a bubble style belongs to a person
-- and follows them. Where both apply, the person's bubble wins for their own
-- messages and the theme keeps the background and everyone else's bubbles.
-- Premium styles show while the sender has Premium; Shop styles are theirs
-- for good. Wearing one is checked by the same trigger as the other
-- cosmetics.

alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check check (kind in (
  'chat_theme', 'avatar_decoration', 'profile_theme', 'name_font', 'name_glow', 'app_icon', 'bubble_style'
));

alter table public.profiles add column if not exists bubble_style text;
grant update (bubble_style) on public.profiles to authenticated;

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

  foreach v_col in array array['name_font', 'name_glow', 'avatar_decoration', 'banner_id', 'bubble_style'] loop
    v_val := case v_col
      when 'name_font' then new.name_font
      when 'name_glow' then new.name_glow
      when 'avatar_decoration' then new.avatar_decoration
      when 'bubble_style' then new.bubble_style
      else new.banner_id
    end;
    v_old := case v_col
      when 'name_font' then old.name_font
      when 'name_glow' then old.name_glow
      when 'avatar_decoration' then old.avatar_decoration
      when 'bubble_style' then old.bubble_style
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
  before update of name_font, name_glow, avatar_decoration, banner_id, bubble_style on public.profiles
  for each row execute function public.tg_profiles_cosmetics_owned();

insert into public.products (id, kind, tier, name, price_paise, sort) values
  ('bubble-glass',  'bubble_style', 'premium', 'Glass',  null, 1),
  ('bubble-neon',   'bubble_style', 'premium', 'Neon',   null, 2),
  ('bubble-sunset', 'bubble_style', 'premium', 'Sunset', null, 3),
  ('bubble-pond',   'bubble_style', 'premium', 'Pond',   null, 4),
  ('bubble-ink',    'bubble_style', 'premium', 'Ink',    null, 5),
  ('bubble-berry',  'bubble_style', 'premium', 'Berry',  null, 6),
  ('bubble-kawaii', 'bubble_style', 'shop',    'Kawaii', 5900, 7),
  ('bubble-pixel',  'bubble_style', 'shop',    'Pixel',  5900, 8),
  ('bubble-gold',   'bubble_style', 'shop',    'Gold',   5900, 9)
on conflict (id) do nothing;
