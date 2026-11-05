-- 06.11: odds movement (see migrations/029_odds_history.sql).
CREATE TABLE IF NOT EXISTS imported_odds_history (
  source_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  kickoff_utc TEXT NOT NULL,
  h REAL, d REAL, a REAL, over25 REAL, btts REAL,
  PRIMARY KEY (source_id, captured_at)
);
CREATE INDEX IF NOT EXISTS imported_odds_history_kickoff ON imported_odds_history (kickoff_utc);
