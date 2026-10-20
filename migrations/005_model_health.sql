-- Remembers free-tier quota exhaustion across restarts/deploys, so exhausted models are skipped instead of retried.
CREATE TABLE IF NOT EXISTS model_health (
  model_key       text PRIMARY KEY,          -- provider:model
  exhausted_until timestamptz NOT NULL,
  reason          text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
