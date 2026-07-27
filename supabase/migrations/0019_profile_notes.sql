-- Status moves from the DM rail onto profiles (a thought bubble) and DM inbox
-- rows. get_notes_for(user_ids) returns each given user's active note that the
-- caller is allowed to see. Visibility: self always; otherwise the target must
-- not be blocked either way, a private target must be followed by the caller,
-- and a 'close'-audience note requires the caller to be in the target's
-- close_friends. 'mutual'-audience notes are visible to anyone who can
-- otherwise view the profile (matches the profile page's private-account gate).
-- One RPC serves both surfaces: pass [profileUserId] on a profile, or all 1:1
-- peer ids for the inbox. No schema change — reuses the notes table.

create or replace function public.get_notes_for(p_user_ids uuid[])
 returns table(
   user_id uuid,
   text text,
   audience text,
   created_at timestamptz,
   display_name text,
   username text,
   avatar_hue integer,
   avatar_url text,
   track jsonb
 )
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select n.user_id, n.text, n.audience, n.created_at,
         p.display_name, p.username, p.avatar_hue, p.avatar_url, n.track
  from public.notes n
  join public.profiles p on p.id = n.user_id
  where n.user_id = any(p_user_ids)
    and n.expires_at > now()
    and (
      n.user_id = (select auth.uid())
      or (
        not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = (select auth.uid()) and b.blocked_id = n.user_id)
             or (b.blocker_id = n.user_id and b.blocked_id = (select auth.uid()))
        )
        and (
          not p.is_private
          or exists (select 1 from public.follows f
                     where f.follower_id = (select auth.uid()) and f.following_id = n.user_id)
        )
        and (
          n.audience = 'mutual'
          or exists (select 1 from public.close_friends cf
                     where cf.user_id = n.user_id and cf.friend_id = (select auth.uid()))
        )
      )
    );
$function$;

revoke all on function public.get_notes_for(uuid[]) from anon;
grant execute on function public.get_notes_for(uuid[]) to authenticated;
