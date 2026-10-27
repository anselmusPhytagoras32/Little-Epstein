ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_id text NOT NULL DEFAULT 'fern'
  CHECK (avatar_id IN ('fern', 'coral', 'sky', 'sun'));
