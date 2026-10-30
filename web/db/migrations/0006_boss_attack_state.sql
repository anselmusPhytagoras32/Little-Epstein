ALTER TABLE boss_raid_players ADD COLUMN IF NOT EXISTS attacking boolean NOT NULL DEFAULT false;
ALTER TABLE boss_raid_players ADD COLUMN IF NOT EXISTS aim_x real NOT NULL DEFAULT 0;
ALTER TABLE boss_raid_players ADD COLUMN IF NOT EXISTS aim_y real NOT NULL DEFAULT -1;
