-- 0136_member_number.sql
--
-- The Hypefy ID carries a member number: the order in which people finished
-- setting up, counting from one. It is the one thing on the card that cannot
-- be acquired later, which is the whole reason to put a number on a
-- membership card at all.
--
-- Counted on completed profiles rather than on rows, so an abandoned signup
-- does not take a number with it and every number belongs to a real person.
-- Once given it is never reissued: the sequence only moves forward, and a
-- profile that somehow becomes incomplete again keeps the number it had.

create sequence if not exists public.profiles_member_no_seq as integer start with 1;

alter table public.profiles add column if not exists member_no integer;

-- The backfill.
--
-- The first three rows share one identical created_at — they were inserted
-- together by the seed — so ordering them by time falls through to a uuid
-- tiebreak, which would hand 0001 to a placeholder account. Those three are
-- named here; everyone after them is ordered by when they actually arrived.
with ordered as (
  select
    id,
    row_number() over (
      order by
        coalesce(
          case username
            when 'aman' then 1
            when 'naitik' then 2
            when 'username' then 3
          end,
          1000000
        ),
        created_at,
        id
    ) as n
  from public.profiles
  where profile_completed
)
update public.profiles p
   set member_no = o.n
  from ordered o
 where p.id = o.id
   and p.member_no is null;

select setval(
  'public.profiles_member_no_seq',
  coalesce((select max(member_no) from public.profiles), 0) + 1,
  false
);

create unique index if not exists profiles_member_no_key on public.profiles (member_no);

create or replace function public.tg_profiles_assign_member_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_completed and new.member_no is null then
    new.member_no := nextval('public.profiles_member_no_seq');
  end if;
  return new;
end $$;

-- The name is load-bearing. Triggers of the same timing fire in alphabetical
-- order, and profiles_preserve_privileged (0050) resets member_no to its old
-- value; "zz" puts this after it, or every assignment would be undone in the
-- same statement that made it.
drop trigger if exists profiles_zz_assign_member_no on public.profiles;
create trigger profiles_zz_assign_member_no
  before insert or update of profile_completed on public.profiles
  for each row execute function public.tg_profiles_assign_member_no();

revoke execute on function public.tg_profiles_assign_member_no() from public, anon, authenticated;

-- Nobody awards themselves 0001. No UPDATE grant on the column, and the
-- preserve trigger as the belt to those braces — 0050's own reasoning.
create or replace function public.tg_profiles_preserve_privileged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.id          := old.id;
  new.is_admin    := old.is_admin;
  new.is_verified := old.is_verified;
  new.referred_by := old.referred_by;
  new.created_at  := old.created_at;
  new.member_no   := old.member_no;
  return new;
end $$;

-- Readable by anyone, like the rest of the card. A column added after 0130
-- is not readable until it is granted by name.
grant select (member_no) on public.profiles to anon, authenticated;
