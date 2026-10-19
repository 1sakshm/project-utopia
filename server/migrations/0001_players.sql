-- Utopia players, friends, challenges and match history (Cloudflare D1 / SQLite).
-- Apply: npx wrangler d1 migrations apply utopia --local   (and --remote for production)

CREATE TABLE players (
  id                TEXT PRIMARY KEY,                    -- device player id (public, appears in rooms)
  key_hash          TEXT NOT NULL,                       -- sha-256 of the device's secret key
  handle            TEXT NOT NULL UNIQUE COLLATE NOCASE, -- @handle, unique, shareable
  name              TEXT NOT NULL,                       -- display name (not unique)
  skin              TEXT NOT NULL DEFAULT 'skin-aurora',
  rating            INTEGER NOT NULL DEFAULT 1000,
  wins              INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  draws             INTEGER NOT NULL DEFAULT 0,
  matches           INTEGER NOT NULL DEFAULT 0,          -- every finished versus round, ranked or not
  created_at        INTEGER NOT NULL,
  last_seen         INTEGER NOT NULL,
  handle_changed_at INTEGER
);
CREATE INDEX players_rating ON players (rating DESC);
CREATE INDEX players_last_seen ON players (last_seen DESC);

-- One row per pair, a < b. 'pending' until the other side accepts.
CREATE TABLE friendships (
  a            TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  b            TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  requested_by TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  accepted_at  INTEGER,
  PRIMARY KEY (a, b)
);
CREATE INDEX friendships_b ON friendships (b);

-- A friend challenge: a private duel room waiting for the other player.
CREATE TABLE invites (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  game_id    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at INTEGER NOT NULL
);
CREATE INDEX invites_to ON invites (to_id, status);

-- Finished versus rounds (for profiles and the admin view).
CREATE TABLE matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  game_id     TEXT,
  kind        TEXT NOT NULL,
  ranked      INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  players     TEXT NOT NULL -- JSON: [{id, handle, score, place, delta}]
);
CREATE INDEX matches_finished ON matches (finished_at DESC);

CREATE TABLE match_players (
  match_id  INTEGER NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  score     INTEGER NOT NULL,
  place     INTEGER NOT NULL,
  delta     INTEGER,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX match_players_player ON match_players (player_id, match_id DESC);
