-- 07.11 (owner request): every ticket gets a visible sequential number („Biletul #249”).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_no INTEGER;
UPDATE tickets t SET ticket_no = r.n FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM tickets) r WHERE r.id = t.id AND t.ticket_no IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_no_uq ON tickets (ticket_no);
