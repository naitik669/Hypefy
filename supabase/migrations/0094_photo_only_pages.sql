-- A page can be just a photo.
--
-- set_note (0093) already accepts a page with a picture and no words, but the
-- notes table still carried its original rule that every page has 1–60
-- characters, so a photo-only page was refused at the insert and the editor
-- said "Couldn't save". Words stay required on a page without a picture.

alter table public.notes drop constraint if exists notes_text_check;
alter table public.notes add constraint notes_text_check check (
  char_length(text) <= 60
  and (char_length(text) >= 1 or image_url is not null)
);
