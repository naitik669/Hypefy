-- Calls to someone already on a call vanished.
--
-- CallProvider's incoming handler was `if (callRef.current) return;` with the
-- comment "busy -- ignore for MVP". It returned before touching the database,
-- so the callee saw and heard nothing, and the CALLER rang for the full 30s
-- before mark_call_missed fired. It read as "they didn't pick up" when the
-- truth was "they're on another call".
--
-- Everything else for this already existed: 'busy' is in the call_sessions
-- status CHECK, and the caller's realtime handler explicitly branches on it and
-- tears the call down. The only missing piece was something that writes it.
--
-- Mirrors decline_call exactly, including the `status = 'ringing'` guard so a
-- late call cannot overwrite a finished one.
create or replace function public.mark_call_busy(p_call_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update call_sessions set status = 'busy', ended_at = now()
  where id = p_call_id and receiver_id = auth.uid() and status = 'ringing';
end $$;

revoke execute on function public.mark_call_busy(uuid) from public, anon;
grant  execute on function public.mark_call_busy(uuid) to authenticated;
