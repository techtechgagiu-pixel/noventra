-- 06.11: credite (see migrations/030_credits.sql).
CREATE TABLE IF NOT EXISTS user_credits (
  user_id    TEXT PRIMARY KEY,
  balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  founder    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (ref, reason)
);
CREATE INDEX IF NOT EXISTS credit_ledger_user ON credit_ledger (user_id, created_at);
INSERT OR IGNORE INTO user_credits (user_id, balance, founder) SELECT id, 0, 1 FROM users;
