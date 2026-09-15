-- The two colours tint the profile background, not the banner: name them so.
alter table public.profiles rename column banner_colors to profile_colors;

alter table public.profiles drop constraint if exists profiles_banner_colors_check;
alter table public.profiles drop constraint if exists profiles_profile_colors_check;
alter table public.profiles add constraint profiles_profile_colors_check check (
  profile_colors is null
  or (
    array_length(profile_colors, 1) = 2
    and profile_colors[1] ~* '^#[0-9a-f]{6}$'
    and profile_colors[2] ~* '^#[0-9a-f]{6}$'
  )
);

grant update (profile_colors) on public.profiles to authenticated;

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
  if new.profile_colors is distinct from old.profile_colors
     and new.profile_colors is not null
     and not coalesce(new.is_premium, false) then
    raise exception 'Custom profile colours come with Premium';
  end if;
  return new;
end $function$;

drop trigger if exists profiles_gradient_premium on public.profiles;
create trigger profiles_gradient_premium
  before update of profile_colors on public.profiles
  for each row execute function public.tg_profiles_gradient_premium();
