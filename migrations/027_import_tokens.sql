-- 02.11 owner request: the laptop exports Stake on its own and uploads it with a private key (no browser session).
-- Only the SHA-256 of the key is stored; the key itself is shown once on /cote.
CREATE TABLE IF NOT EXISTS import_tokens (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
