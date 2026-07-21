-- Scheduled posts: composed now, published later. Kept in their own table so
-- feed queries (posts) are completely untouched; a pg_cron job moves due rows
-- into posts every minute. Images are uploaded to storage at compose time and
-- their URLs stored here, so publishing is a pure row move.

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text,
  body text,
  image_url text,
  image_urls text[] not null default '{}',
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  track jsonb,
  poll jsonb,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_posts_user_idx on public.scheduled_posts (user_id, scheduled_at);
create index if not exists scheduled_posts_due_idx on public.scheduled_posts (scheduled_at);

alter table public.scheduled_posts enable row level security;

drop policy if exists "scheduled_posts: own read" on public.scheduled_posts;
create policy "scheduled_posts: own read" on public.scheduled_posts
  for select using (user_id = (select auth.uid()));

drop policy if exists "scheduled_posts: own insert" on public.scheduled_posts;
create policy "scheduled_posts: own insert" on public.scheduled_posts
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "scheduled_posts: own delete" on public.scheduled_posts;
create policy "scheduled_posts: own delete" on public.scheduled_posts
  for delete using (user_id = (select auth.uid()));

-- Publisher: move every due row into posts (bypasses RLS as definer). Returns
-- how many were published. Only callable by the cron job, not app users.
create or replace function public.publish_due_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int;
begin
  with due as (
    delete from public.scheduled_posts
    where scheduled_at <= now()
    returning user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll
  ), ins as (
    insert into public.posts (user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, created_at)
    select user_id, caption, body, image_url, image_urls, hashtags, mentions, track, poll, now()
    from due
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.publish_due_scheduled_posts() from public, anon, authenticated;

-- Run the publisher every minute.
create extension if not exists pg_cron;
select cron.schedule('publish-scheduled-posts', '* * * * *', $$ select public.publish_due_scheduled_posts(); $$);
