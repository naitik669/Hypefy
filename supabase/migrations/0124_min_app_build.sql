-- The oldest Android build still allowed to run.
--
-- The app is a shell around the live site, so the site is always current
-- and the shell is whatever was installed. When the site comes to need
-- something only a newer shell has (a permission, a plugin, a fix in the
-- native code), an old install would simply misbehave with no way to tell
-- its owner why. This is the number the app compares itself against; below
-- it, the app shows "Update Hypefy" and a button to the Play Store.
--
-- 0 means no build is too old, which is how it starts. To require an
-- update, set it to the versionCode of the oldest build that should keep
-- working:
--
--   update public.app_settings set value = '412'::jsonb where key = 'min_android_build';
--
-- Readable signed out as well: the app checks before anyone has signed in.

insert into public.app_settings (key, value) values ('min_android_build', '0'::jsonb)
on conflict (key) do nothing;

create or replace function public.min_app_build()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric::int end
                     from public.app_settings where key = 'min_android_build'), 0);
$$;
revoke all on function public.min_app_build() from public;
grant execute on function public.min_app_build() to anon, authenticated;
