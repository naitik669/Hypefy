-- 0223: favourites, and can_see_sticker(). Acts as each person in turn.
-- Each t_assert raises on failure, so the run stops at the first one.

create or replace function public.t_expect_error(sql text, pat text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm !~* pat then raise exception 'wrong error for [%]: % (wanted %)', sql, sqlerrm, pat; end if;
    return;
  end;
  raise exception 'FAILED: expected error % for [%] but it succeeded', pat, sql;
end $$;
grant execute on function public.t_expect_error(text, text) to anon, authenticated;
create or replace function public.t_assert(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', what; end if; end $$;
grant execute on function public.t_assert(boolean, text) to anon, authenticated;
create table public.t_ids (k text primary key, id uuid); grant all on public.t_ids to anon, authenticated;

-- Each of a, b, c, d makes stickers (owner folder = their id).
insert into public.stickers (id, owner_id, path, width, height) values
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a/aaaaaaaa-0000-0000-0000-000000000001.webp',100,100),
  ('aaaaaaaa-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a/aaaaaaaa-0000-0000-0000-000000000002.webp',100,100),
  ('aaaaaaaa-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a/aaaaaaaa-0000-0000-0000-000000000003.webp',100,100),
  ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b/bbbbbbbb-0000-0000-0000-000000000001.webp',100,100),
  ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b/bbbbbbbb-0000-0000-0000-000000000002.webp',100,100),
  ('cccccccc-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c/cccccccc-0000-0000-0000-000000000001.webp',100,100),
  ('dddddddd-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000d/dddddddd-0000-0000-0000-000000000001.webp',100,100),
  ('dddddddd-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000d/dddddddd-0000-0000-0000-000000000002.webp',100,100);

set role authenticated;
-- b sends b1 to the a/b chat, and sends b2 then unsends it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.send_sticker('11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000001');
insert into public.t_ids select 'b2msg', (public.send_sticker('11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000002')->>'id')::uuid;
update public.messages set is_unsent = true where id = (select id from public.t_ids where k='b2msg');
-- c sends c1 to the a/c chat, which a moderator then removes.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
insert into public.t_ids select 'c1msg', (public.send_sticker('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001')->>'id')::uuid;
-- d sends d2 to the b/d chat, which a is not in.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.send_sticker('33333333-3333-3333-3333-333333333333','dddddddd-0000-0000-0000-000000000002');
reset role;
update public.messages set removed_at = now() where id = (select id from public.t_ids where k='c1msg');
set role authenticated;

-- a: what can a reach?
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_assert(public.can_see_sticker('aaaaaaaa-0000-0000-0000-000000000001'), 'your own sticker is reachable');
select public.t_assert(public.can_see_sticker('bbbbbbbb-0000-0000-0000-000000000001'), 'a sticker sent in your chat is reachable');
select public.t_assert(not public.can_see_sticker('bbbbbbbb-0000-0000-0000-000000000002'), 'an unsent sticker message does not make it reachable');
select public.t_assert(not public.can_see_sticker('cccccccc-0000-0000-0000-000000000001'), 'a removed sticker message does not make it reachable');
select public.t_assert(not public.can_see_sticker('dddddddd-0000-0000-0000-000000000001'), 'a stranger''s sticker is not reachable');
select public.t_assert(not public.can_see_sticker('dddddddd-0000-0000-0000-000000000002'), 'a sticker sent in a chat you are not in is not reachable');
select public.t_assert(not public.can_see_sticker(gen_random_uuid()), 'a made-up id is not reachable');

-- favourites
select public.t_assert(public.set_sticker_favourite('bbbbbbbb-0000-0000-0000-000000000001', true), 'starring a sticker from a chat works');
select public.t_assert(public.set_sticker_favourite('aaaaaaaa-0000-0000-0000-000000000002', true), 'starring your own works');
select public.t_assert(public.set_sticker_favourite('aaaaaaaa-0000-0000-0000-000000000002', true), 'starring twice is fine');
select public.t_expect_error($$select public.set_sticker_favourite('dddddddd-0000-0000-0000-000000000001', true)$$, 'No such sticker');
select public.t_assert((select count(*) from public.my_favourite_stickers()) = 2, 'two favourites, each once');
select public.t_assert((select id from public.my_favourite_stickers() limit 1) = 'aaaaaaaa-0000-0000-0000-000000000002', 'newest favourite first');
select public.t_expect_error($$select * from public.sticker_favourites$$, 'permission denied');
select public.t_expect_error($$insert into public.sticker_favourites values ('00000000-0000-0000-0000-00000000000a','dddddddd-0000-0000-0000-000000000001')$$, 'permission denied');
select public.t_assert(not public.set_sticker_favourite('aaaaaaaa-0000-0000-0000-000000000002', false), 'unstarring');
select public.t_assert((select count(*) from public.my_favourite_stickers()) = 1, 'unstarred one is gone');

-- b's favourites are not a's
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.t_assert((select count(*) from public.my_favourite_stickers()) = 0, 'someone else''s favourites are not yours');
-- b deletes b1: it drops off a's shelf
update public.stickers set deleted_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_assert((select count(*) from public.my_favourite_stickers()) = 0, 'a deleted sticker drops off the shelf');
select public.t_expect_error($$select public.set_sticker_favourite('bbbbbbbb-0000-0000-0000-000000000001', true)$$, 'No such sticker');
reset role;
update public.stickers set deleted_at = null where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select public.t_assert((select deleted_at is null from public.stickers where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'b1 is back for the pack checks');
set role authenticated;

-- signed out
reset role; set role anon;
select set_config('request.jwt.claim.sub', '', false);
select public.t_expect_error($$select public.set_sticker_favourite('aaaaaaaa-0000-0000-0000-000000000001', true)$$, 'permission denied');
select public.t_expect_error($$select * from public.my_favourite_stickers()$$, 'permission denied');
select public.t_expect_error($$select public.can_see_sticker('aaaaaaaa-0000-0000-0000-000000000001')$$, 'permission denied');
reset role;
