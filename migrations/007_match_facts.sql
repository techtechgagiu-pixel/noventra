-- Half-time score and corners, read after the match, to settle the new half-time / corner markets.
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS ht_home integer;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS ht_away integer;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS corners_home integer;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS corners_away integer;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS facts_checked_at timestamptz;
