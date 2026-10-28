-- "Șterge din listă": the creator (or an admin) removes a ticket from Bilete create; statistics are unchanged.
ALTER TABLE tickets ADD COLUMN hidden_at TEXT;
ALTER TABLE tickets ADD COLUMN hidden_by TEXT REFERENCES users(id) ON DELETE SET NULL;
