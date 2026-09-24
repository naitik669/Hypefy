-- The profile card leads with the photo.
--
-- The photo layout is now the card's main design (a photo that melts into
-- the card, then name, bio, counts and Follow). New profiles start on it.
--
-- Existing profiles on 'centred' are moved over too: 'centred' was the column
-- default, so nearly all of them never chose it. Anyone who picked 'aligned'
-- keeps it, and anyone can switch back from Edit card.

alter table public.profiles alter column card_layout set default 'photo';

update public.profiles set card_layout = 'photo' where card_layout = 'centred';
