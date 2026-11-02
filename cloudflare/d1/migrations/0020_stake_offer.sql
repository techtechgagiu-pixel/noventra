-- 02.11: Stake-only football offer (see migrations/026_stake_offer.sql).
ALTER TABLE imported_odds ADD COLUMN category TEXT;
ALTER TABLE imported_odds ADD COLUMN tournament_slug TEXT;
