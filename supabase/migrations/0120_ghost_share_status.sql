-- What the share sheet needs to know to offer Ghost Share on one Shot or
-- post: whether this person may Ghost Share it at all, and how many they
-- have left this week. One call when the sheet opens.
--
-- "can" is false for your own content (Ghost Share is for other people's),
-- for anything removed, and while the feature is switched off. It says
-- nothing about any other person.

create or replace function public.ghost_share_status(p_kind text, p_content_id uuid)
returns table (can boolean, used int, allowed int, resets_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    public.ghost_share_enabled()
      and p_kind in ('post', 'shot')
      and public.ghost_content_author(p_kind, p_content_id) is not null
      and public.ghost_content_author(p_kind, p_content_id) <> (select auth.uid()),
    a.used, a.allowed, a.resets_at
  from public.ghost_share_allowance() a;
$$;

revoke all on function public.ghost_share_status(text, uuid) from public, anon;
grant execute on function public.ghost_share_status(text, uuid) to authenticated;
