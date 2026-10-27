ALTER TABLE players DROP CONSTRAINT IF EXISTS players_avatar_id_check;
ALTER TABLE players ADD CONSTRAINT players_avatar_id_check
  CHECK (avatar_id IN ('fern', 'coral', 'sky', 'sun', 'builder', 'scout', 'chef', 'diver'));
