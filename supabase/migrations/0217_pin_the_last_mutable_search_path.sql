-- The last function in public with an unpinned search_path.
--
-- Supabase's advisor flags every function that does not set search_path,
-- because a function resolving unqualified names against whatever the caller
-- happens to have on their path can be made to call something else. Every
-- other function in the schema already sets it; this one was missed.
--
-- The actual risk here is nil, and it is worth saying so rather than implying
-- a vulnerability was closed. scheduled_message_limits is SECURITY INVOKER —
-- it runs with the caller's own rights, not the owner's — and its body is
-- three literals:
--
--     select interval '30 seconds', interval '90 days', 50
--
-- It references no table, no type and no other function, so there is nothing
-- for a hijacked path to resolve differently. This is advisor hygiene: one
-- fewer warning, so that a real one is visible when it appears.
--
-- Pinned to the empty string rather than 'public'. A function that needs
-- nothing from any schema should say exactly that; it is the stricter setting
-- and it cannot regress into resolving something unintended later.
--
-- IMMUTABLE and PARALLEL SAFE are carried over deliberately: the planner uses
-- both, and create-or-replace does not keep properties the new definition
-- omits.

create or replace function public.scheduled_message_limits()
returns table (min_lead interval, max_ahead interval, max_pending integer)
language sql
immutable
parallel safe
set search_path = ''
as $function$ select interval '30 seconds', interval '90 days', 50 $function$;
