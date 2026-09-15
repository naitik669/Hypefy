-- Chat themes: one theme per conversation, seen by everyone in it.
--
-- Choosing needs the theme (free, Premium while you have it, or bought);
-- seeing it needs nothing, so a friend without Premium still gets your Pond.
-- The change is announced as a system message, like vanish mode, which is
-- also how the other side's open chat learns to redraw (conversations is not
-- in the realtime publication; messages is).

alter table public.conversations add column if not exists theme text;

create or replace function public.set_chat_theme(p_conversation_id uuid, p_theme text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_label text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'; end if;

  if p_theme is not null then
    select name into v_label from public.products
     where id = p_theme and kind = 'chat_theme' and active;
    if v_label is null then raise exception 'Unknown theme'; end if;
    if not public.owns_product(v_uid, p_theme) then raise exception 'Not unlocked'; end if;
  end if;

  if (select theme from public.conversations where id = p_conversation_id) is not distinct from p_theme then
    return;
  end if;

  update public.conversations set theme = p_theme where id = p_conversation_id;

  select coalesce(display_name, username, 'Someone') into v_name
    from public.profiles where id = v_uid;
  perform public.send_message(
    p_conversation_id,
    case when p_theme is null
      then v_name || ' turned off the chat theme'
      else v_name || ' changed the theme to ' || v_label
    end,
    'system'
  );
end $function$;

revoke all on function public.set_chat_theme(uuid, text) from public, anon;
grant execute on function public.set_chat_theme(uuid, text) to authenticated;
