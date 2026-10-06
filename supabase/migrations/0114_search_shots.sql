-- Shots can be searched.
--
-- Search covered people, posts and tags. A Shot's caption and hashtags were
-- indexed nowhere a person could reach: typing the words of a Shot you had
-- watched yesterday found nothing, and a #tag page counted only posts.
--
-- The same shape and the same scoring as search_posts (0062), over the one
-- text field a Shot has. SECURITY INVOKER, so row-level security still hides
-- removed Shots and those of private accounts the searcher does not follow.

create or replace function public.search_shots(p_q text, p_limit int default 18)
returns setof public.shots
language sql
stable
set search_path = public
as $$
  with q as (
    select
      btrim(coalesce(p_q, '')) like '#%' as is_tag,
      replace(replace(replace(
        lower(btrim(regexp_replace(coalesce(p_q, ''), '^[@#]', ''))),
        '\', '\\'), '%', '\%'), '_', '\_') as t,
      lower(btrim(regexp_replace(coalesce(p_q, ''), '^[@#]', ''))) as raw
  )
  select s.*
  from public.shots s
  cross join q
  where q.t <> ''
    and s.removed_at is null
    and (
      s.hashtags @> array[q.raw]
      or (not q.is_tag and lower(coalesce(s.caption, '')) like '%' || q.t || '%')
    )
  order by (
      case when s.hashtags @> array[q.raw] then 34 else 0 end
    + case when lower(coalesce(s.caption, '')) like q.t || '%' then 14 else 0 end
    + ln(1 + greatest(coalesce(s.hype_count, 0), 0)) * 5
    + ln(1 + greatest(coalesce(s.comment_count, 0), 0)) * 3
    + greatest(0, 21 - extract(epoch from (now() - s.created_at)) / 86400.0)
  ) desc, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 18), 50));
$$;

comment on function public.search_shots(text, int) is
  'Ranked Shot search over caption and hashtags, scored like search_posts. SECURITY INVOKER so RLS still applies.';

revoke execute on function public.search_shots(text, int) from public, anon;
grant execute on function public.search_shots(text, int) to authenticated;
