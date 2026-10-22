-- The one advisor warning 0142 introduced.
--
-- `max_pinned_messages()` went in without a search_path, so it resolves
-- names against whatever the caller's happens to be. It only returns a
-- constant, so there is nothing here to hijack today — but it is called from
-- inside `set_message_pinned`, which is SECURITY DEFINER, and a function
-- without a fixed search_path is the shape of that problem rather than an
-- instance of it. 0135 did the same for `max_pinned_posts()`; this is that
-- line, for the function added since.

alter function public.max_pinned_messages() set search_path to 'public';
