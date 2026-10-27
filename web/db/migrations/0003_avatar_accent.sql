ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_accent text NOT NULL DEFAULT 'sea'
  CHECK (avatar_accent IN ('sea', 'coral', 'sun', 'leaf'));
