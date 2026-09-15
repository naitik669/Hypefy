-- The second drop: six frames, eight bubbles, six chat themes.
-- Drawn in code under the same ids (cosmetics.ts, bubble-styles.ts,
-- chat-themes.ts); tests hold the two lists together.

insert into public.products (id, kind, tier, name, price_paise, sort) values
  ('deco-holo',     'avatar_decoration', 'shop',    'Holo foil', 7900, 7),
  ('deco-8bit',     'avatar_decoration', 'shop',    '8-bit',     4900, 8),
  ('deco-bolt',     'avatar_decoration', 'premium', 'Bolt',      null, 9),
  ('deco-petals',   'avatar_decoration', 'premium', 'Petals',    null, 10),
  ('deco-hypestar', 'avatar_decoration', 'premium', 'Hype star', null, 11),
  ('deco-gilded',   'avatar_decoration', 'shop',    'Gilded',    9900, 12),

  ('bubble-paper',    'bubble_style', 'premium', 'Paper',    null, 10),
  ('bubble-outline',  'bubble_style', 'premium', 'Outline',  null, 11),
  ('bubble-aurora',   'bubble_style', 'shop',    'Aurora',   5900, 12),
  ('bubble-sticker',  'bubble_style', 'shop',    'Sticker',  5900, 13),
  ('bubble-terminal', 'bubble_style', 'premium', 'Terminal', null, 14),
  ('bubble-limepop',  'bubble_style', 'premium', 'Lime pop', null, 15),
  ('bubble-chrome',   'bubble_style', 'shop',    'Chrome',   7900, 16),
  ('bubble-stitch',   'bubble_style', 'shop',    'Stitch',   5900, 17),

  ('theme-citynight', 'chat_theme', 'premium', 'City night', null, 10),
  ('theme-sunday',    'chat_theme', 'free',    'Sunday',     null, 11),
  ('theme-matcha',    'chat_theme', 'premium', 'Matcha',     null, 12),
  ('theme-monsoon',   'chat_theme', 'shop',    'Monsoon',    7900, 13),
  ('theme-void',      'chat_theme', 'free',    'Void',       null, 14),
  ('theme-lofi',      'chat_theme', 'premium', 'Lo-fi',      null, 15)
on conflict (id) do nothing;
