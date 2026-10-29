-- 29.10 owner decision: a daily custom-ticket limit set per account (e.g. 10 for one friend), instead of the default.
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_daily_limit INTEGER CHECK (custom_daily_limit BETWEEN 0 AND 30);
