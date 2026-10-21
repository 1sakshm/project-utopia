-- "Beat my score": async challenges. A player sends a finished run (game + seed + start level + score) to a friend,
-- who replays the identical game within 24 hours. Only the first reply counts.
-- Also: live friend challenges remember their scoring mode ('standard' raw score, or 'friendly' = percent of own best).

CREATE TABLE async_challenges (
  id          TEXT PRIMARY KEY,
  from_pid    TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  to_pid      TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  game_id     TEXT NOT NULL,
  seed        INTEGER NOT NULL,
  start_level INTEGER NOT NULL DEFAULT 1,  -- the level the run started at (same seed + same level = same game)
  score       INTEGER NOT NULL,            -- the challenger's score to beat
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,            -- created_at + 24 h
  reply_score INTEGER,                     -- NULL until the friend plays it
  replied_at  INTEGER
);
CREATE INDEX async_challenges_to ON async_challenges (to_pid, expires_at);
CREATE INDEX async_challenges_from ON async_challenges (from_pid, created_at DESC);

ALTER TABLE invites ADD COLUMN mode TEXT NOT NULL DEFAULT 'standard';
