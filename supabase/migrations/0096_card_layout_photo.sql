-- More profile card layouts, and the card leads with the photo.
--
-- Four layouts join the three there were: framed (photo in a rounded frame),
-- poster (photo fills the card, details on glass), pass (a member pass with
-- the QR as its stub) and banner (card colour as a banner, big squircle
-- photo). Anyone can pick one from Edit card.
--
-- The photo layout (a photo that melts into the card, then name, bio, counts
-- and Follow) is the default for new profiles. Existing profiles on
-- 'centred' are moved to it too: 'centred' was the column default, so nearly
-- all of them never chose it. Anyone on 'aligned' chose that and keeps it,
-- and anyone can switch back from Edit card.

alter table public.profiles drop constraint if exists profiles_card_layout_check;
alter table public.profiles add constraint profiles_card_layout_check
  check (card_layout in ('photo', 'framed', 'poster', 'pass', 'banner', 'centred', 'aligned'));

alter table public.profiles alter column card_layout set default 'photo';

update public.profiles set card_layout = 'photo' where card_layout = 'centred';
