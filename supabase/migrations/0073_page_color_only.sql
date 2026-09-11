-- Recolour your page without rewriting it.
--
-- set_note starts a page afresh — new created_at, a new 24 hours, the old
-- one archived and its reactions left behind — which is right for new words
-- and wrong for a new colour. This changes the colour of the page you have
-- up now, and nothing else: created_at does not move, so the archive trigger
-- lets it through and reactions stay matched to it.

create or replace function public.set_note_color(p_color text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
  if p_color is not null and p_color !~ '^[a-z]{2,16}$' then raise exception 'Invalid color'; end if;
  update public.notes
     set color = p_color
   where user_id = (select auth.uid())
     and expires_at > now();
  if not found then raise exception 'No active note'; end if;
end $function$;

revoke all on function public.set_note_color(text) from public, anon;
grant execute on function public.set_note_color(text) to authenticated, service_role;
