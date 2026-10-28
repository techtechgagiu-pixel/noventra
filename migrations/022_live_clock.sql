-- 28.10 owner request: show the match minute next to a live score on tickets (the minute when the score was read).
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS live_clock TEXT;
