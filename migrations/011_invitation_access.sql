-- Additive migration: existing tickets and identities are preserved.
CREATE TABLE invitation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0
);
ALTER TABLE sessions ADD COLUMN invitation_id uuid REFERENCES invitation_codes(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN owner_code_hash text;
CREATE INDEX sessions_invitation_idx ON sessions(invitation_id);
