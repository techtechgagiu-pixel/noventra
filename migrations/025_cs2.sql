-- 30.10 owner decision: Counter-Strike 2 as a separate "league". Schedule/results from PandaScore, team strength from
-- the Valve Regional Standings, prices from OddsPapi and the owner's Stake export. Football is not touched.
INSERT INTO leagues (id, country, name, provider, provider_key, priority, top10) VALUES ('CS2', 'Esports', 'Counter-Strike 2', 'pandascore', 'csgo', 900, false)
  ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS cs_matches (
  id TEXT PRIMARY KEY,
  begin_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  best_of INTEGER,
  team1_id TEXT, team1 TEXT NOT NULL, team1_acronym TEXT,
  team2_id TEXT, team2 TEXT NOT NULL, team2_acronym TEXT,
  score1 INTEGER, score2 INTEGER, winner_id TEXT,
  league TEXT, serie TEXT, tournament TEXT, tier TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_matches_team1 ON cs_matches (team1_id, begin_at);
CREATE INDEX IF NOT EXISTS cs_matches_team2 ON cs_matches (team2_id, begin_at);
CREATE INDEX IF NOT EXISTS cs_matches_begin ON cs_matches (begin_at);
CREATE TABLE IF NOT EXISTS cs_rankings (
  team_key TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  rank INTEGER NOT NULL,
  points INTEGER NOT NULL,
  roster TEXT,
  as_of TEXT NOT NULL
);
