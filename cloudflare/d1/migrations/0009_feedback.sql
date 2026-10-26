-- "Ajută-ne să îmbunătățim": ideas and problems sent by signed-in users; read by admins only.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(random()&3),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author TEXT,
  kind TEXT NOT NULL DEFAULT 'idee',
  message TEXT NOT NULL,
  page TEXT,
  status TEXT NOT NULL DEFAULT 'nou',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
