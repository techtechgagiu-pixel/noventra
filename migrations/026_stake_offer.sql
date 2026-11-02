-- 02.11 owner decision: the football offer comes from the owner's Stake export only. Stake matches the ESPN schedule
-- does not carry become fixtures of their own (provider 'stake', one league per Stake tournament); their results are
-- entered by the owner. The import keeps the Stake country and tournament for that.
ALTER TABLE imported_odds ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE imported_odds ADD COLUMN IF NOT EXISTS tournament_slug TEXT;
