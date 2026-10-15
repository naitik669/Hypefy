-- 0138_frame_assets.sql
--
-- Avatar frames you can upload instead of hand-writing.
--
-- Every cosmetic in the app is drawn in code: AvatarFrame.tsx is a switch of
-- SVG paths keyed by id, and `products` carries only price, tier and
-- ownership. Adding one of our own designs therefore meant writing SVG by
-- hand and shipping a deploy, which does not scale and which only a
-- developer can do.
--
-- A frame may now carry a file instead. The art lives in a storage bucket,
-- the catalogue row points at it, and three numbers say how it sits over
-- the avatar — because an export that is a few percent off should be
-- nudged, not sent back to Figma.
--
-- Writes go through SECURITY DEFINER functions gated on is_admin(), not
-- through a grant. `products` has only SELECT granted to the API roles and
-- that stays true: the catalogue is not something a session may write to,
-- whoever is holding it.

/* ── The asset, and where it sits ──────────────────────────────────────── */

alter table public.products
  add column if not exists asset_path text,
  -- The art's size as a multiple of the avatar's width, and its offset from
  -- centre in the same unit. Defaults mean "exactly as exported".
  add column if not exists scale numeric not null default 1,
  add column if not exists offset_x numeric not null default 0,
  add column if not exists offset_y numeric not null default 0;

/* ── Clearing the shelf ────────────────────────────────────────────────── */

-- Retired, not deleted: purchases.product_id is a foreign key, and an item
-- somebody once owned has to stay resolvable even when nobody may wear it.
-- (Nothing has ever been bought, but the rule holds for when something has.)
update public.products set active = false
 where kind = 'avatar_decoration' and id <> 'deco-bolt';

-- Three people wear a frame; two of those frames are going. Their column is
-- cleared rather than left holding a dead id — visibleDecoration() would
-- draw nothing either way, but a stale id is a trap for the day an id is
-- reused.
update public.profiles set avatar_decoration = null
 where avatar_decoration is not null
   and avatar_decoration not in (select id from public.products where active);

/* ── Where the art lives ───────────────────────────────────────────────── */

insert into storage.buckets (id, name, public)
values ('cosmetics', 'cosmetics', true)
on conflict (id) do nothing;

-- Readable by anyone: a frame is drawn on public profiles, for signed-out
-- visitors too.
drop policy if exists "cosmetics: public read" on storage.objects;
create policy "cosmetics: public read" on storage.objects
  for select using (bucket_id = 'cosmetics');

-- Written by admins only. Three separate policies because a single FOR ALL
-- would also cover SELECT and quietly undo the line above.
drop policy if exists "cosmetics: admin upload" on storage.objects;
create policy "cosmetics: admin upload" on storage.objects
  for insert with check (bucket_id = 'cosmetics' and public.is_admin());

drop policy if exists "cosmetics: admin update" on storage.objects;
create policy "cosmetics: admin update" on storage.objects
  for update using (bucket_id = 'cosmetics' and public.is_admin());

drop policy if exists "cosmetics: admin delete" on storage.objects;
create policy "cosmetics: admin delete" on storage.objects
  for delete using (bucket_id = 'cosmetics' and public.is_admin());

/* ── The two things the panel can do ───────────────────────────────────── */

/**
 * Create or re-save an uploaded frame.
 *
 * Only free and premium: Razorpay is wired but not live, and a priced item
 * nobody can buy is worse than no item. The id shape is checked here rather
 * than trusted from a form — it ends up in a URL and in a CSS selector.
 */
create or replace function public.admin_save_frame(
  p_id text,
  p_name text,
  p_tier text,
  p_asset_path text,
  p_scale numeric default 1,
  p_offset_x numeric default 0,
  p_offset_y numeric default 0
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
  -- Sized and placed within reach of the avatar. A frame scaled to ten
  -- would cover the screen; one offset by five would be off it.
  if p_scale < 0.25 or p_scale > 3 then raise exception 'scale out of range'; end if;
  if abs(p_offset_x) > 1 or abs(p_offset_y) > 1 then raise exception 'offset out of range'; end if;

  insert into public.products (id, kind, tier, name, active, sort, asset_path, scale, offset_x, offset_y)
  values (
    p_id, 'avatar_decoration', p_tier, btrim(p_name), true,
    coalesce((select max(sort) + 1 from public.products where kind = 'avatar_decoration'), 1),
    btrim(p_asset_path), p_scale, p_offset_x, p_offset_y
  )
  on conflict (id) do update set
    name = excluded.name,
    tier = excluded.tier,
    asset_path = excluded.asset_path,
    scale = excluded.scale,
    offset_x = excluded.offset_x,
    offset_y = excluded.offset_y
  -- An id that already belongs to a code-drawn frame or another kind of
  -- item is not ours to overwrite.
  where products.kind = 'avatar_decoration' and products.asset_path is not null;
end $$;

/** Rename, retier, reorder or retire anything in the catalogue. */
create or replace function public.admin_update_product(
  p_id text,
  p_name text default null,
  p_tier text default null,
  p_sort integer default null,
  p_active boolean default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_tier is not null and p_tier not in ('free', 'premium', 'shop') then
    raise exception 'unknown tier';
  end if;
  update public.products set
    name = coalesce(nullif(btrim(p_name), ''), name),
    tier = coalesce(p_tier, tier),
    sort = coalesce(p_sort, sort),
    active = coalesce(p_active, active)
  where id = p_id;
end $$;

revoke execute on function public.admin_save_frame(text, text, text, text, numeric, numeric, numeric)
  from public, anon;
revoke execute on function public.admin_update_product(text, text, text, integer, boolean)
  from public, anon;

notify pgrst, 'reload schema';
