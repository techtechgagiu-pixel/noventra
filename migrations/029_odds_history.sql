-- 06.11: odds movement. One row per imported match and capture with the main prices only (1X2, over 2.5, GG);
-- the agents read how the market moved since the first capture. Rows older than 7 days are deleted on import.
CREATE TABLE IF NOT EXISTS imported_odds_history (
  source_id TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  kickoff_utc TIMESTAMPTZ NOT NULL,
  h REAL, d REAL, a REAL, over25 REAL, btts REAL,
  PRIMARY KEY (source_id, captured_at)
);
CREATE INDEX IF NOT EXISTS imported_odds_history_kickoff ON imported_odds_history (kickoff_utc);
