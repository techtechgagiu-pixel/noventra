-- 03.11 owner request: an assistant on the site that answers from the app's own data. Its own daily spend cap.
CREATE TABLE IF NOT EXISTS assistant_usage (
  day TEXT PRIMARY KEY,
  microusd BIGINT NOT NULL DEFAULT 0,
  questions INTEGER NOT NULL DEFAULT 0
);
