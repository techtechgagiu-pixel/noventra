-- 07.11 (owner request): every ticket gets a visible sequential number („Biletul #249”). Existing tickets are numbered by
-- creation time; new ones take the next number when they are saved.
ALTER TABLE tickets ADD COLUMN ticket_no INTEGER;
UPDATE tickets SET ticket_no = (SELECT COUNT(*) FROM tickets t2 WHERE t2.created_at < tickets.created_at OR (t2.created_at = tickets.created_at AND t2.id <= tickets.id));
CREATE UNIQUE INDEX IF NOT EXISTS tickets_no_uq ON tickets (ticket_no);
