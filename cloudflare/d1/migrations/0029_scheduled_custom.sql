-- 23.11: custom ticket batches queued automatically every day at a set hour (Europe/Bucharest), as if the owner
-- had pressed the button in the Custom form. One row per standing order; last_run_day prevents a second run.
CREATE TABLE IF NOT EXISTS scheduled_custom (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  settings TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_day TEXT,
  last_result TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
