-- Cartonașe (06.11): cards per team, read from the finished match's summary like corners.
ALTER TABLE fixtures ADD COLUMN cards_home INTEGER;
ALTER TABLE fixtures ADD COLUMN cards_away INTEGER;
