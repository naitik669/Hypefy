-- Comments without a photo failed to send.
--
-- create_comment had two overloads: the baseline (p_post_id, p_body,
-- p_owner_id) and 0087's (…, p_parent_id, p_image_url), whose extra
-- arguments default to null. The app leaves those two out when a comment has
-- no parent and no photo, so the call matched BOTH, and PostgREST answered
-- 300 "could not choose the best candidate function". Photo comments, which
-- pass p_image_url, were unambiguous and still worked.
--
-- The five-argument version does everything the baseline one did (with null
-- parent and image it is the same comment), so the old one goes.

drop function if exists public.create_comment(uuid, text, uuid);
