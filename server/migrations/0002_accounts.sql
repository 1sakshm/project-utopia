-- Accounts: a password and/or a linked Google account on a player, several signed-in devices per player,
-- and a cloud copy of the player's progress so it follows them to new devices.

ALTER TABLE players ADD COLUMN password_hash TEXT;   -- "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>", NULL for guests
ALTER TABLE players ADD COLUMN google_sub TEXT;      -- Google account id ("sub"), NULL if not linked
ALTER TABLE players ADD COLUMN email TEXT;           -- the linked Google account's email (shown to the owner only)
CREATE UNIQUE INDEX players_google ON players (google_sub) WHERE google_sub IS NOT NULL;

-- Every signed-in device holds its own secret key; only hashes are stored. Logging out deletes that device's key.
CREATE TABLE player_keys (
  key_hash   TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  via        TEXT NOT NULL,          -- 'device' (first visit), 'password', 'google'
  created_at INTEGER NOT NULL,
  last_used  INTEGER
);
CREATE INDEX player_keys_player ON player_keys (player_id);
INSERT INTO player_keys (key_hash, player_id, via, created_at) SELECT key_hash, id, 'device', created_at FROM players;

-- Cloud save: progress, rewards and settings as one JSON document. `version` guards against lost updates.
CREATE TABLE saves (
  player_id  TEXT PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Brute-force guard for password logins.
CREATE TABLE login_failures (
  handle TEXT PRIMARY KEY COLLATE NOCASE,
  count  INTEGER NOT NULL,
  since  INTEGER NOT NULL
);
