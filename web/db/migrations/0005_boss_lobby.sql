CREATE TABLE IF NOT EXISTS boss_raids (
  room_id uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  opponent text NOT NULL CHECK (opponent IN ('kirkify', 'diddy', 'epstein')),
  phase text NOT NULL DEFAULT 'waiting' CHECK (phase IN ('waiting', 'playing', 'won')),
  hp integer NOT NULL DEFAULT 0,
  max_hp integer NOT NULL DEFAULT 0,
  boss_x real NOT NULL DEFAULT 480,
  boss_y real NOT NULL DEFAULT 130,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE boss_raids ADD COLUMN IF NOT EXISTS boss_x real NOT NULL DEFAULT 480;
ALTER TABLE boss_raids ADD COLUMN IF NOT EXISTS boss_y real NOT NULL DEFAULT 130;

CREATE TABLE IF NOT EXISTS boss_raid_players (
  room_id uuid NOT NULL REFERENCES boss_raids(room_id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  x real NOT NULL DEFAULT 480,
  y real NOT NULL DEFAULT 440,
  alive boolean NOT NULL DEFAULT true,
  damage_total integer NOT NULL DEFAULT 0,
  last_seen timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, player_id)
);
