-- Cartonașe (06.11): cards per team, read from the finished match's summary like corners.
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS cards_home integer;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS cards_away integer;
