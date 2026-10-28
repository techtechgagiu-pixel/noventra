-- "Șterge din listă": the creator (or an admin) removes a ticket from Bilete create. The ticket, its selections and
-- every agent prediction stay saved, so statistics are unchanged.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES users(id) ON DELETE SET NULL;
