CREATE TABLE d1_bridge_nonces(nonce TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE INDEX d1_bridge_nonce_expiry_idx ON d1_bridge_nonces(expires_at);
ALTER TABLE ticket_generation_jobs ADD COLUMN claim_recovered INTEGER NOT NULL DEFAULT 0;
