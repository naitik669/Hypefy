-- 0224: packs. Runs after checks.sql, with its stickers and helpers.
-- a and b share chat 1; a and c share chat 2; b and d share chat 3.
-- Stickers: a1 a2 a3 (a's), b1 b2 (b's), c1 (c's), d1 d2 (d's).
-- b1 was sent in chat 1; d2 in chat 3; c1's message was removed.

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- ── making one ──
select public.t_expect_error($$select public.create_sticker_pack('Soft', 'link', array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[])$$, '2 to 30');
select public.t_expect_error($$select public.create_sticker_pack('Soft', 'link', array['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001']::uuid[])$$, '2 to 30');
select public.t_expect_error($$select public.create_sticker_pack('   ', 'link', array['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002']::uuid[])$$, 'name');
select public.t_expect_error($$select public.create_sticker_pack(repeat('x', 41), 'link', array['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002']::uuid[])$$, 'name');
select public.t_expect_error($$select public.create_sticker_pack('Soft', 'everyone', array['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002']::uuid[])$$, 'Who can add');
select public.t_expect_error($$select public.create_sticker_pack('Soft', 'link', array['aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001']::uuid[])$$, 'No such sticker');
select public.t_expect_error($$select public.create_sticker_pack('Soft', 'link', array['aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002']::uuid[])$$, 'No such sticker');
select public.t_expect_error($$select public.create_sticker_pack('Soft', 'link', array['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002']::uuid[], 'aaaaaaaa-0000-0000-0000-000000000003')$$, 'cover');
select public.t_expect_error($$select public.create_sticker_pack('Soft', 'link', (select array_agg(gen_random_uuid()) from generate_series(1, 31)))$$, 'No such sticker|2 to 30');

-- a link pack: own sticker plus one b sent in chat; cover is the second
insert into public.t_ids select 'link', (public.create_sticker_pack('  Soft hours ', 'link', array['aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001']::uuid[], 'bbbbbbbb-0000-0000-0000-000000000001')->>'id')::uuid;
-- a people pack
insert into public.t_ids select 'people', (public.create_sticker_pack('Just us', 'people', array['aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003']::uuid[])->>'id')::uuid;

reset role;
select public.t_assert((select name from public.sticker_packs where id = (select id from public.t_ids where k='link')) = 'Soft hours', 'the name is trimmed');
select public.t_assert((select code ~ '^[2-9A-HJ-NP-Z]{8}$' from public.sticker_packs where id = (select id from public.t_ids where k='link')), 'the code is 8 characters with no 0 O 1 I');
select public.t_assert((select count(*) from public.sticker_pack_items where pack_id = (select id from public.t_ids where k='link')) = 2, 'a sticker asked for twice is in once');
insert into public.t_ids select 'linkcode', null; update public.t_ids set k = 'linkcode:' || (select code from public.sticker_packs where id = (select id from public.t_ids where k='link')) where k = 'linkcode';
insert into public.t_ids select 'peoplecode:' || code, id from public.sticker_packs where id = (select id from public.t_ids where k='people');
-- a stable view of the two codes for the dynamic sql below
create or replace function public.t_code(which text) returns text language sql stable as $$ select split_part(k, ':', 2) from public.t_ids where k like which || 'code:%' $$;
grant execute on function public.t_code(text) to anon, authenticated;
-- codes are well spread: 200 of them, no repeats, every character used
select public.t_assert((select count(distinct c) = 200 from (select public.new_sticker_pack_code() c from generate_series(1, 200)) x), 'codes do not repeat');
select public.t_assert((select count(distinct ch) from (select regexp_split_to_table(string_agg(public.new_sticker_pack_code(), ''), '') ch from generate_series(1, 400)) x) = 32, 'every one of the 32 characters turns up');
set role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_assert(json_array_length(public.my_sticker_packs()) = 2, 'both packs are on the maker''s rail');
select public.t_assert((public.my_sticker_packs()->0->>'name') = 'Soft hours', 'oldest pack first');
select public.t_assert((public.my_sticker_packs()->0->>'mine')::boolean, 'the maker reads their pack as mine');
select public.t_assert((public.my_sticker_packs()->0->'stickers'->0->>'id') = 'aaaaaaaa-0000-0000-0000-000000000001', 'stickers keep the order picked');
select public.t_expect_error($$select * from public.sticker_packs$$, 'permission denied');
select public.t_expect_error($$select * from public.sticker_pack_items$$, 'permission denied');
select public.t_expect_error($$select * from public.sticker_pack_grants$$, 'permission denied');
select public.t_expect_error($$insert into public.sticker_pack_saves (user_id, pack_id) values ('00000000-0000-0000-0000-00000000000a', (select id from public.t_ids where k='people'))$$, 'permission denied');
select public.t_expect_error($$select public.sticker_pack_json((select id from public.t_ids where k='people'))$$, 'permission denied');

-- ── opening by code ──
-- d, a stranger, signed in
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.t_assert(public.sticker_pack_by_code(public.t_code('link')) is not null, 'anyone signed in can open a link pack by its code');
select public.t_assert(public.sticker_pack_by_code(lower(substr(public.t_code('link'),1,4)) || '-' || substr(public.t_code('link'),5)) is not null, 'a code typed in lower case with a dash still opens');
select public.t_assert(not (public.sticker_pack_by_code(public.t_code('link'))->>'mine')::boolean, 'a stranger does not read it as mine');
select public.t_assert(public.sticker_pack_by_code(public.t_code('people')) is null, 'a people pack does not open for someone it was not sent to');
select public.t_assert(public.sticker_pack_by_code('ZZZZZZZZ') is null, 'a code nobody issued opens nothing');
select public.t_expect_error(format('select public.save_sticker_pack(%L)', public.t_code('people')), 'No such pack');
select public.t_expect_error(format('select public.send_sticker_pack(%L, %L)', '33333333-3333-3333-3333-333333333333', (select id from public.t_ids where k='people')), 'No such pack');
-- d cannot change a's pack
select public.t_expect_error(format('select public.rename_sticker_pack(%L, %L)', (select id from public.t_ids where k='link'), 'mine now'), 'No such pack');
select public.t_expect_error(format('select public.delete_sticker_pack(%L)', (select id from public.t_ids where k='link')), 'No such pack');
select public.t_expect_error(format('select public.add_stickers_to_pack(%L, array[%L]::uuid[])', (select id from public.t_ids where k='link'), 'dddddddd-0000-0000-0000-000000000001'), 'No such pack');
select public.t_expect_error(format('select public.remove_sticker_from_pack(%L, %L)', (select id from public.t_ids where k='link'), 'aaaaaaaa-0000-0000-0000-000000000001'), 'No such pack');
-- opening a link pack does not make its stickers d's to use until it is added
select public.t_assert(not public.can_see_sticker('aaaaaaaa-0000-0000-0000-000000000001'), 'opening a pack does not make its stickers reachable');
select public.t_assert((public.save_sticker_pack(public.t_code('link'))->>'saved')::boolean, 'adding a link pack puts it on your rail');
select public.t_assert((select count(*) from public.my_sticker_packs() x) = 1 and json_array_length(public.my_sticker_packs()) = 1, 'one pack on d''s rail');
select public.t_assert((public.my_sticker_packs()->0->>'fresh')::boolean, 'a newly added pack is marked new');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.t_assert(not (public.sticker_pack_by_code(public.t_code('link'))->>'saved')::boolean, 'd adding it does not make it read as added for b');
select public.t_assert(not (public.sticker_pack_by_code(public.t_code('link'))->>'fresh')::boolean, 'nor marked new for b');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.mark_sticker_pack_seen((select id from public.t_ids where k='link'));
select public.t_assert(not (public.my_sticker_packs()->0->>'fresh')::boolean, 'opening it clears the mark');
select public.save_sticker_pack(public.t_code('link'));
reset role;
select public.t_assert((select count(*) from public.sticker_pack_saves where user_id = '00000000-0000-0000-0000-00000000000d') = 1, 'adding twice is one row');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.t_assert(public.can_see_sticker('aaaaaaaa-0000-0000-0000-000000000001'), 'an added pack''s stickers are reachable');
select public.t_assert(public.set_sticker_favourite('aaaaaaaa-0000-0000-0000-000000000001', true), 'and can be starred');
-- d makes a pack out of an added pack's stickers plus their own
select public.t_assert(public.create_sticker_pack('Remix', 'link', array['aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001']::uuid[]) is not null, 'a pack can be made from stickers in an added pack');
select public.unsave_sticker_pack((select id from public.t_ids where k='link'));
select public.t_assert(json_array_length(public.my_sticker_packs()) = 1, 'removing it takes it off the rail, leaving only d''s own');
select public.set_sticker_favourite('aaaaaaaa-0000-0000-0000-000000000001', false);
select public.t_assert(public.can_see_sticker('aaaaaaaa-0000-0000-0000-000000000001'), 'still reachable through d''s own Remix pack');

-- ── signed out ──
reset role; set role anon;
select set_config('request.jwt.claim.sub', '', false);
select public.t_assert(public.sticker_pack_by_code(public.t_code('link')) is not null, 'signed out, a link pack opens');
select public.t_assert(not (public.sticker_pack_by_code(public.t_code('link'))->>'saved')::boolean, 'signed out, it is not saved');
select public.t_assert(public.sticker_pack_by_code(public.t_code('people')) is null, 'signed out, a people pack never opens');
select public.t_expect_error(format('select public.save_sticker_pack(%L)', public.t_code('link')), 'permission denied');
select public.t_expect_error($$select public.my_sticker_packs()$$, 'permission denied');
select public.t_expect_error($$select * from public.sticker_packs$$, 'permission denied');
reset role;

-- ── sending a people pack grants exactly the chat's other members ──
set role authenticated;
-- c (in chat 2 with a) cannot open it yet
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select public.t_assert(public.sticker_pack_by_code(public.t_code('people')) is null, 'before it is sent, c cannot open the people pack');
-- b cannot send a's people pack, even into a chat with a
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.t_expect_error(format('select public.send_sticker_pack(%L, %L)', '11111111-1111-1111-1111-111111111111', (select id from public.t_ids where k='people')), 'No such pack');
-- a sends it into chat 2 (with c) only
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_expect_error(format('select public.send_sticker_pack(%L, %L)', '33333333-3333-3333-3333-333333333333', (select id from public.t_ids where k='people')), 'Not a member');
insert into public.t_ids select 'peoplemsg', (public.send_sticker_pack('22222222-2222-2222-2222-222222222222', (select id from public.t_ids where k='people'))->>'id')::uuid;
reset role;
select public.t_assert((select kind from public.messages where id = (select id from public.t_ids where k='peoplemsg')) = 'sticker_pack', 'it goes as a sticker_pack message');
select public.t_assert((select metadata ?& array['pack_id','code','name','count','owner_id','cover'] from public.messages where id = (select id from public.t_ids where k='peoplemsg')), 'the card carries the pack, its code, name, count, maker and cover');
select public.t_assert((select not (metadata ?| array['mine','saved','state','added']) from public.messages where id = (select id from public.t_ids where k='peoplemsg')), 'the card stores nothing about who reads it');
select public.t_assert((select array_agg(user_id order by user_id) from public.sticker_pack_grants where pack_id = (select id from public.t_ids where k='people')) = array['00000000-0000-0000-0000-00000000000c']::uuid[], 'only c, the chat''s other member, is let in');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select public.t_assert(public.sticker_pack_by_code(public.t_code('people')) is not null, 'c can open it now');
select public.t_assert((public.save_sticker_pack(public.t_code('people'))->>'saved')::boolean, 'and add it');
-- c cannot pass it on
select public.t_expect_error(format('select public.send_sticker_pack(%L, %L)', '22222222-2222-2222-2222-222222222222', (select id from public.t_ids where k='people')), 'Only the person who made');
-- b and d still cannot
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.t_assert(public.sticker_pack_by_code(public.t_code('people')) is null, 'b, who was not sent it, still cannot open it');
select public.t_assert(public.can_see_sticker('aaaaaaaa-0000-0000-0000-000000000003') = false, 'nor reach its stickers');

-- a link pack is sent by anyone who can open it, and grants nobody
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.send_sticker_pack('11111111-1111-1111-1111-111111111111', (select id from public.t_ids where k='link'));
reset role;
select public.t_assert((select count(*) from public.sticker_pack_grants where pack_id = (select id from public.t_ids where k='link')) = 0, 'a link pack writes no grants');
select public.t_assert((select metadata->'cover'->0->>'id' from public.messages where kind = 'sticker_pack' and metadata->>'pack_id' = (select id::text from public.t_ids where k='link') limit 1) = 'bbbbbbbb-0000-0000-0000-000000000001', 'the chosen cover is drawn first on the card');
set role authenticated;

-- ── changing your own ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_assert((public.rename_sticker_pack((select id from public.t_ids where k='link'), ' Softer ')->>'name') = 'Softer', 'renaming');
select public.t_expect_error(format('select public.rename_sticker_pack(%L, %L)', (select id from public.t_ids where k='link'), ''), 'name');
select public.t_assert(json_array_length(public.add_stickers_to_pack((select id from public.t_ids where k='link'), array['aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001']::uuid[])->'stickers') = 3, 'adding skips the ones already in');
select public.t_expect_error(format('select public.add_stickers_to_pack(%L, array[%L]::uuid[])', (select id from public.t_ids where k='link'), 'dddddddd-0000-0000-0000-000000000002'), 'No such sticker');
select public.t_assert(json_array_length(public.remove_sticker_from_pack((select id from public.t_ids where k='link'), 'bbbbbbbb-0000-0000-0000-000000000001')->'stickers') = 2, 'taking one out');
reset role;
select public.t_assert((select cover_sticker_id is null from public.sticker_packs where id = (select id from public.t_ids where k='link')), 'taking out the cover clears it');
select public.t_assert((select deleted_at is null from public.stickers where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'taking one out never deletes the sticker');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_expect_error(format('select public.remove_sticker_from_pack(%L, %L)', (select id from public.t_ids where k='link'), 'aaaaaaaa-0000-0000-0000-000000000003'), '2 to 30');
select public.t_expect_error(format('select public.remove_sticker_from_pack(%L, %L)', (select id from public.t_ids where k='link'), 'dddddddd-0000-0000-0000-000000000001'), 'not in this pack');
-- 30 at most when adding
reset role;
insert into public.stickers (id, owner_id, path, width, height)
select ('aaaaaaaa-1111-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-00000000000a/aaaaaaaa-1111-0000-0000-' || lpad(g::text, 12, '0') || '.webp', 10, 10
  from generate_series(1, 29) g;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.t_expect_error(format('select public.add_stickers_to_pack(%L, %L::uuid[])', (select id from public.t_ids where k='link'),
  (select array_agg(('aaaaaaaa-1111-0000-0000-' || lpad(g::text, 12, '0'))::uuid) from generate_series(1, 29) g)), '2 to 30');
select public.t_assert(json_array_length(public.add_stickers_to_pack((select id from public.t_ids where k='link'),
  (select array_agg(('aaaaaaaa-1111-0000-0000-' || lpad(g::text, 12, '0'))::uuid) from generate_series(1, 28) g))->'stickers') = 30, 'up to 30 fit');
-- deleting takes it out of everyone's rail and stops it opening
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select public.t_assert(json_array_length(public.my_sticker_packs()) = 1, 'c has the people pack on their rail');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.delete_sticker_pack((select id from public.t_ids where k='people'));
select public.t_assert(json_array_length(public.my_sticker_packs()) = 1, 'deleted pack leaves the maker''s rail');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select public.t_assert(json_array_length(public.my_sticker_packs()) = 0, 'and everyone else''s');
select public.t_assert(public.sticker_pack_by_code(public.t_code('people')) is null, 'and does not open by code');
reset role;
select public.t_assert((select count(*) from public.stickers where id in ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003') and deleted_at is null) = 2, 'deleting a pack keeps its stickers');

-- a pack can be reported
insert into public.reports (reporter_id, target_type, target_id, reason) values ('00000000-0000-0000-0000-00000000000d', 'sticker_pack', (select id from public.t_ids where k='link'), 'spam');
