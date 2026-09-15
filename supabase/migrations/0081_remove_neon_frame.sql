-- The Neon avatar frame is retired. Nobody had bought or was wearing it.
update public.profiles set avatar_decoration = null where avatar_decoration = 'deco-neon';
delete from public.products where id = 'deco-neon' and not exists (select 1 from public.purchases where product_id = 'deco-neon');
