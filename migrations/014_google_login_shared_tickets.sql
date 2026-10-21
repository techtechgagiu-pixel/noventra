-- Google sign-in for everyone (user request 2026-10-21); administration stays reachable only with the permanent code.
-- A Google session is marked so it can be told apart from code sessions; the administrator can block an account.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS google_login boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
CREATE INDEX IF NOT EXISTS tickets_created_idx ON tickets(created_at DESC);
