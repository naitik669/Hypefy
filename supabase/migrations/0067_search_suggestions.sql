-- ─────────────────────────────────────────────────────────────────────
-- "Did you mean …?"
--
-- A typo currently produces an empty screen and no way forward: search
-- matches on substrings, so "fome" shares no substring with "home" and the
-- result is nothing at all. The person who typed it has no way of knowing
-- whether they misspelled a word or the app has no such content.
--
-- Trigram similarity is the right tool: it compares three-character windows,
-- so "fome" and "home" overlap on "ome" and score well, while an unrelated
-- word does not. Note this is a SUGGESTION, not a rewrite — searching for
-- something odd on purpose must still return what was actually asked for.
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm with schema extensions;

/**
 * Terms close to what was typed, drawn from what this app actually contains.
 *
 * Definer, because it aggregates across everyone's posts — which makes the
 * author filter load-bearing rather than decorative, exactly as in
 * get_topic_cards. A private account's hashtags must not leak out as
 * spelling hints.
 */
create or replace function public.search_suggestions(
  p_q text,
  p_limit int default 3
)
returns table (term text, kind text, score real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with q as (
    select lower(btrim(regexp_replace(coalesce(p_q, ''), '^[@#]', ''))) as t
  ),
  tags as (
    select distinct lower(h.tag_raw) as term
    from public.posts p
    join public.profiles pr on pr.id = p.user_id
    cross join lateral unnest(coalesce(p.hashtags, array[]::text[])) as h(tag_raw)
    where p.removed_at is null
      and coalesce(pr.is_private, false) = false
  ),
  people as (
    select distinct lower(username) as term
    from public.profiles
    where profile_completed = true and username is not null
    union
    select distinct lower(display_name)
    from public.profiles
    where profile_completed = true
      and display_name is not null
      and btrim(display_name) <> ''
  ),
  candidates as (
    select term, 'tag'::text as kind from tags
    union all
    select term, 'person'::text from people
  )
  select
    c.term,
    c.kind,
    similarity(c.term, q.t) as score
  from candidates c
  cross join q
  where q.t <> ''
    -- Not the thing they already typed: "did you mean home?" on a search for
    -- home is the app talking to itself.
    and c.term <> q.t
    -- 0.3 is deliberately not lower. Below it, trigram matching starts
    -- offering words that merely share two letters, and a confidently wrong
    -- suggestion is worse than none — it sends someone off after content
    -- that was never what they wanted.
    and similarity(c.term, q.t) > 0.3
    -- A near-miss, not a different word entirely. Without this, a short
    -- query matches long terms that happen to contain it.
    and abs(length(c.term) - length(q.t)) <= 4
  order by score desc, length(c.term), c.term
  limit greatest(1, least(coalesce(p_limit, 3), 5));
$$;

comment on function public.search_suggestions(text, int) is
  'Trigram "did you mean" candidates drawn from public hashtags and completed profiles.';

revoke all on function public.search_suggestions(text, int) from public, anon;
grant execute on function public.search_suggestions(text, int) to authenticated;
