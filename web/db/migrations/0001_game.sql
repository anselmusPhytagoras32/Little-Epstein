CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  username text NOT NULL CHECK (length(username) BETWEEN 2 AND 24),
  age_confirmed boolean NOT NULL DEFAULT false CHECK (age_confirmed),
  timezone text NOT NULL DEFAULT 'UTC',
  reminder_time time,
  reminders_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 36),
  timezone text NOT NULL DEFAULT 'UTC',
  invitation_code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES players(id),
  phase text NOT NULL DEFAULT 'open' CHECK (phase IN ('open', 'active', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'eliminated', 'won')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  eliminated_on date,
  eliminated_reason text CHECK (eliminated_reason IN ('self_reported', 'missed_checkin') OR eliminated_reason IS NULL),
  PRIMARY KEY (room_id, player_id)
);
CREATE INDEX IF NOT EXISTS room_members_player_idx ON room_members(player_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS daily_checkins (
  room_id uuid NOT NULL,
  player_id uuid NOT NULL,
  game_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, player_id, game_date),
  FOREIGN KEY (room_id, player_id) REFERENCES room_members(room_id, player_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS checkins_player_date_idx ON daily_checkins(player_id, game_date DESC);

CREATE TABLE IF NOT EXISTS room_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES players(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('checked_in', 'eliminated', 'milestone', 'reaction')),
  game_date date NOT NULL,
  milestone integer,
  reaction text CHECK (reaction IN ('rooting', 'lifebuoy', 'sparkle') OR reaction IS NULL),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_room_recent_idx ON room_events(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminder_dispatches (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_date date NOT NULL,
  subscription_id bigint NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, room_id, game_date, subscription_id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id_hash text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

-- Neon is reachable only through the app's authenticated server. Keep its
-- DATABASE_URL private and never include it in browser-visible configuration.
CREATE INDEX IF NOT EXISTS invitation_lookup_idx ON rooms(invitation_code);
CREATE INDEX IF NOT EXISTS reminders_pending_idx ON players(timezone, reminder_time) WHERE reminders_enabled;
