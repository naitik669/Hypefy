-- The invite code, made without pgcrypto.
--
-- 0170 generated it with gen_random_bytes, which lives in pgcrypto and not
-- in public — and the function pins search_path to public, as every
-- definer here does. The DDL was valid, so the migration applied happily
-- and the function failed the first time it was called. It never reached
-- anybody: nothing referenced it yet, and the dry run against the real
-- schema is where it surfaced.
--
-- gen_random_uuid is core Postgres and needs no extension. Thirty-two hex
-- characters, 122 bits of it random, which is not worth guessing at.
create or replace function public.set_group_invite(
  p_conversation_id uuid,
  p_requires_approval boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  if not public.is_conv_admin(p_conversation_id) then
    raise exception 'Admins only';
  end if;
  if not exists (
    select 1 from public.conversations
     where id = p_conversation_id and type = 'group'
  ) then
    raise exception 'Groups only';
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '');

  insert into public.conversation_invites
    (conversation_id, code, requires_approval, created_by)
  values (p_conversation_id, v_code, coalesce(p_requires_approval, false), auth.uid())
  on conflict (conversation_id) do update
    set code = excluded.code,
        requires_approval = excluded.requires_approval,
        created_by = excluded.created_by,
        created_at = now();

  return v_code;
end $$;

revoke all on function public.set_group_invite(uuid, boolean) from public, anon;
grant execute on function public.set_group_invite(uuid, boolean) to authenticated;
