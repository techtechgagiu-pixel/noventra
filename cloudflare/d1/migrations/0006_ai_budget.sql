-- Shared, conservative paid-model allowance. Uncertain network outcomes stay reserved.
CREATE TABLE d1_ai_budget_days(day TEXT PRIMARY KEY,total_microusd INTEGER NOT NULL CHECK(total_microusd>=0));
CREATE TABLE d1_ai_budget_reservations(id TEXT PRIMARY KEY,day TEXT NOT NULL REFERENCES d1_ai_budget_days(day),model TEXT NOT NULL,reserved_microusd INTEGER NOT NULL,actual_microusd INTEGER,status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held','recorded')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX d1_ai_budget_day_idx ON d1_ai_budget_reservations(day,status);
