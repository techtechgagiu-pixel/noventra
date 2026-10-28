-- 28.10 owner request: show the match minute next to a live score on tickets (the minute when the score was read).
ALTER TABLE fixtures ADD COLUMN live_clock TEXT;
