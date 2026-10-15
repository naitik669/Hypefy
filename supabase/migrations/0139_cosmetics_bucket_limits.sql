-- 0139_cosmetics_bucket_limits.sql
--
-- The cosmetics bucket was created in 0138 with no size limit and no mime
-- allowlist, which every other bucket in the project has. The only check on
-- an upload was a constant in the admin form — a convenience, not a
-- boundary, and the bucket would have taken a 40MB video named .svg.
--
-- 512KB, which is the cap the form now states. Generous for drawn artwork,
-- and affordable because the browser caches one copy of a frame however
-- many avatars are wearing it: the cost is a single download a session,
-- not one per avatar. It would not be a reasonable number per post.
--
-- PNG is allowed alongside SVG. The form only accepts SVG today, but the
-- layered composer will import both, and opening it here costs nothing
-- while writes stay admin-only.

update storage.buckets
   set file_size_limit = 512 * 1024,
       allowed_mime_types = array['image/svg+xml', 'image/png']
 where id = 'cosmetics';
