-- 03.11: site assistant spend per UTC day (see migrations/028_assistant.sql).
CREATE TABLE IF NOT EXISTS assistant_usage (
  day TEXT PRIMARY KEY,
  microusd INTEGER NOT NULL DEFAULT 0,
  questions INTEGER NOT NULL DEFAULT 0
);
