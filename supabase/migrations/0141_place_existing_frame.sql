-- 0141_place_existing_frame.sql
--
-- Move a frame that is already published.
--
-- Placing one was a thing you could only do on the way in: the placer
-- lived in the upload form, so a frame that turned out to sit a little
-- high had to be uploaded again under a new id. This is the same four
-- numbers, after the fact.
--
-- Narrow on purpose rather than reusing admin_save_frame. That one is an
-- upsert, so re-placing through it means re-sending the name, the tier
-- and the path — which would overwrite a rename made in another tab, and
-- would refuse outright for a frame somebody had moved to the Shop tier,
-- since saving validates tier and placing has no business caring about it.

create or replace function public.admin_place_frame(
  p_id text,
  p_scale numeric,
  p_offset_x numeric,
  p_offset_y numeric,
  p_rotation numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- The same bounds the placer clamps to, because a definer function is
  -- reachable without the placer.
  if p_scale < 0.25 or p_scale > 3 then raise exception 'scale out of range'; end if;
  if abs(p_offset_x) > 1 or abs(p_offset_y) > 1 then raise exception 'offset out of range'; end if;
  if abs(p_rotation) > 360 then raise exception 'rotation out of range'; end if;

  -- Only an uploaded frame. The code-drawn ones have no artwork to move,
  -- and their geometry is in the component rather than in these columns.
  update public.products set
    scale = p_scale, offset_x = p_offset_x, offset_y = p_offset_y, rotation = p_rotation
  where id = p_id and kind = 'avatar_decoration' and asset_path is not null;

  if not found then
    raise exception 'no uploaded frame with that id';
  end if;
end $$;

revoke execute on function public.admin_place_frame(text, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.admin_place_frame(text, numeric, numeric, numeric, numeric)
  to authenticated;

notify pgrst, 'reload schema';
