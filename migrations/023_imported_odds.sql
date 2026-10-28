-- 29.10 owner decision: odds exported on the owner's laptop (Stake) are imported by hand and used by the agents
-- for up to 4 days, like the cached The Odds API prices. One row per source match, newest capture wins.
CREATE TABLE IF NOT EXISTS imported_odds (
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  league TEXT,
  kickoff_utc TIMESTAMPTZ NOT NULL,
  markets JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_id)
);
CREATE INDEX IF NOT EXISTS imported_odds_kickoff ON imported_odds (source, kickoff_utc);
