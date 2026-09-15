-- The paywall promises a reminder before a free trial turns into a charge.
-- This keeps that promise: two days before a trial ends, the member gets a
-- notification (and, through the existing notifications webhook, a push).
--
-- Once per subscription. A trial already cancelled is skipped — nothing is
-- going to be charged, so there is nothing to warn about.

alter table public.subscriptions add column if not exists reminded_at timestamptz;

create or replace function public.remind_trials_ending()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
begin
  for r in
    select id, user_id
      from public.subscriptions
     where plan = 'premium'
       and status = 'trialing'
       and not cancel_at_period_end
       and reminded_at is null
       and trial_ends_at is not null
       and trial_ends_at > now()
       and trial_ends_at <= now() + interval '2 days'
     for update skip locked
  loop
    insert into public.notifications (user_id, actor_id, type, body)
    values (
      r.user_id,
      null,
      'trial_reminder',
      'Your free trial ends in 2 days. Premium is ₹125/month after that. Cancel anytime in Settings.'
    );
    update public.subscriptions set reminded_at = now() where id = r.id;
  end loop;
end $function$;

revoke all on function public.remind_trials_ending() from public, anon, authenticated;

select cron.unschedule('remind-trials-ending')
 where exists (select 1 from cron.job where jobname = 'remind-trials-ending');
select cron.schedule('remind-trials-ending', '0 * * * *', 'select public.remind_trials_ending();');
