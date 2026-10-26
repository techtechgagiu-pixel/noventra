-- "Ajută-ne să îmbunătățim": ideas and problems sent by signed-in users; read by admins only.
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author text,
  kind text NOT NULL DEFAULT 'idee',
  message text NOT NULL,
  page text,
  status text NOT NULL DEFAULT 'nou',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
