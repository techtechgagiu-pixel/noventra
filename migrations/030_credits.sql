-- 06.11: credite (1 credit = până la 6 meciuri pe bilet). Conturile existente sunt „fondator” (gratuite, ca până acum).
CREATE TABLE IF NOT EXISTS user_credits (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance    integer NOT NULL DEFAULT 0 CONSTRAINT user_credits_balance_check CHECK (balance >= 0),
  founder    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,
  delta      integer NOT NULL,
  reason     text NOT NULL,
  ref        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ref, reason)
);
CREATE INDEX IF NOT EXISTS credit_ledger_user ON credit_ledger (user_id, created_at);
INSERT INTO user_credits (user_id, balance, founder) SELECT id, 0, 1 FROM users ON CONFLICT DO NOTHING;
