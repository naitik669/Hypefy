-- A profile background you mix yourself: two colours, blended top to bottom,
-- in place of a preset banner. Premium only, like the GIF banner, and drawn
-- only while its owner has Premium (src/lib/profile.ts).
alter table public.profiles add column if not exists banner_colors text[];

alter table public.profiles drop constraint if exists profiles_banner_colors_check;
alter table public.profiles add constraint profiles_banner_colors_check check (
  banner_colors is null
  or (
    array_length(banner_colors, 1) = 2
    and banner_colors[1] ~* '^#[0-9a-f]{6}$'
    and banner_colors[2] ~* '^#[0-9a-f]{6}$'
  )
);

grant update (banner_colors) on public.profiles to authenticated;

create or replace function public.tg_profiles_gradient_premium()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.banner_colors is distinct from old.banner_colors
     and new.banner_colors is not null
     and not coalesce(new.is_premium, false) then
    raise exception 'Custom gradients come with Premium';
  end if;
  return new;
end $function$;

drop trigger if exists profiles_gradient_premium on public.profiles;
create trigger profiles_gradient_premium
  before update of banner_colors on public.profiles
  for each row execute function public.tg_profiles_gradient_premium();
