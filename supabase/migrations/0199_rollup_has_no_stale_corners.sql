-- 0198 backfilled the rollup and left two corners holding the old number.
--
-- It rebuilt creator_daily_stats from post_views and shot_views, and the
-- rows it touched came out exactly right: 2,162 views across them, against
-- 2,162 actual rows in the two view tables. Verified by counting both.
--
-- But it only wrote rows for (a) days from the first recorded view onward
-- and (b) users who still have content. Everything outside those two
-- bounds kept whatever the broken counter had left there:
--
--   41 rows before 3 Sep 2026, holding 98 views  — there is no impression
--      data that far back at all, so the honest figure is zero, not 98.
--   14 rows for people whose posts are all removed, holding 118 views —
--      never in the backfill set, so never corrected.
--
-- Small numbers, but they make the table disagree with itself: summing it
-- gave 2,378 where the source data holds 2,162, and a total that does not
-- reconcile is worse than no total.
--
-- So every row is recomputed, not just the ones in range. Where there is no
-- view data the answer is 0, which is what "we were not counting yet"
-- should look like on a chart — not a number inherited from a counter that
-- measured something else.
--
-- Idempotent: running it twice changes nothing the second time.

update public.creator_daily_stats s
   set views = (
         (select count(*) from public.post_views v
            join public.posts p on p.id = v.post_id
           where p.user_id = s.user_id and v.viewed_on = s.day)
         +
         (select count(*) from public.shot_views v
            join public.shots t on t.id = v.shot_id
           where t.user_id = s.user_id and v.viewed_on = s.day)
       )::int,
       followers = (
         select count(*) from public.follows f
          where f.following_id = s.user_id
            and f.created_at::date <= s.day
       )::int,
       captured_at = now();
