-- Music everywhere: an attached track ({id,title,artist,artwork,preview},
-- sourced from the iTunes Search API) on notes, shows and posts, plus a
-- profile anthem. All nullable — music is always optional.
alter table public.notes add column if not exists track jsonb;
alter table public.shows add column if not exists track jsonb;
alter table public.posts add column if not exists track jsonb;
alter table public.profiles add column if not exists anthem jsonb;
