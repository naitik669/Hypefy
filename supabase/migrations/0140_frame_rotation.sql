-- 0140_frame_rotation.sql
--
-- A frame can be turned as well as moved and sized.
--
-- The placer now works the way a design tool does — drag the art, pull a
-- corner, swing a handle — and rotation was the one of those three the
-- catalogue could not remember. Degrees, clockwise, about the art's own
-- centre, so it composes with scale and offset without any of them having
-- to know about the others.

alter table public.products add column if not exists rotation numeric not null default 0;

-- admin_save_frame gains p_rotation. Replaced whole rather than altered:
-- a definer function's body is its security boundary and is easier to
-- audit as one piece than as a diff.
create or replace function public.admin_save_frame(
  p_id text,
  p_name text,
  p_tier text,
  p_asset_path text,
  p_scale numeric default 1,
  p_offset_x numeric default 0,
  p_offset_y numeric default 0,
  p_rotation numeric default 0
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_tier not in ('free', 'premium') then
    raise exception 'tier must be free or premium';
  end if;
  if p_id !~ '^[a-z0-9-]{3,40}$' then
    raise exception 'id must be 3-40 characters of a-z, 0-9 and dashes';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'name is required';
  end if;
  if coalesce(btrim(p_asset_path), '') = '' then
    raise exception 'asset is required';
  end if;
  if p_scale < 0.25 or p_scale > 3 then raise exception 'scale out of range'; end if;
  if abs(p_offset_x) > 1 or abs(p_offset_y) > 1 then raise exception 'offset out of range'; end if;
  if abs(p_rotation) > 360 then raise exception 'rotation out of range'; end if;

  insert into public.products (id, kind, tier, name, active, sort, asset_path, scale, offset_x, offset_y, rotation)
  values (
    p_id, 'avatar_decoration', p_tier, btrim(p_name), true,
    coalesce((select max(sort) + 1 from public.products where kind = 'avatar_decoration'), 1),
    btrim(p_asset_path), p_scale, p_offset_x, p_offset_y, p_rotation
  )
  on conflict (id) do update set
    name = excluded.name,
    tier = excluded.tier,
    asset_path = excluded.asset_path,
    scale = excluded.scale,
    offset_x = excluded.offset_x,
    offset_y = excluded.offset_y,
    rotation = excluded.rotation
  where products.kind = 'avatar_decoration' and products.asset_path is not null;
end $$;

revoke execute on function public.admin_save_frame(text, text, text, text, numeric, numeric, numeric, numeric)
  from public, anon;

notify pgrst, 'reload schema';
