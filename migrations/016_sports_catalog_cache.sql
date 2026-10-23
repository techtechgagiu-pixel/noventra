-- Informational sports feed only. Not used by analysis jobs or ticket generation.
-- Persistent cache and lease survive Render restarts; provider_usage enforces the UTC daily budget.
CREATE TABLE IF NOT EXISTS sports_catalog_cache (
  provider text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
