-- Polls on posts: the caption is the question, posts.poll holds
-- {options: string[]} (2-4), and poll_votes stores one changeable vote
-- per person per post.

alter table public.posts add column if not exists poll jsonb;

create table if not exists public.poll_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  option_idx int not null check (option_idx >= 0 and option_idx < 8),
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

alter table public.poll_votes enable row level security;

-- Anyone signed-in can read votes (results are public, like hype counts).
drop policy if exists "poll_votes: read" on public.poll_votes;
create policy "poll_votes: read" on public.poll_votes
  for select using (true);

drop policy if exists "poll_votes: own insert" on public.poll_votes;
create policy "poll_votes: own insert" on public.poll_votes
  for insert with check (voter_id = (select auth.uid()));

drop policy if exists "poll_votes: own update" on public.poll_votes;
create policy "poll_votes: own update" on public.poll_votes
  for update using (voter_id = (select auth.uid())) with check (voter_id = (select auth.uid()));
