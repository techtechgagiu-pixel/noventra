-- Persistent visibility into background settlement, including sleep/restart gaps.
CREATE TABLE IF NOT EXISTS automation_runs (
  name text PRIMARY KEY,
  started_at timestamptz,
  finished_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  detail jsonb NOT NULL DEFAULT '{}',
  lease_owner text,
  lease_until timestamptz
);
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS results_checked_at timestamptz;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS source_observed_at timestamptz;
ALTER TABLE ticket_selections ADD COLUMN IF NOT EXISTS settled_at timestamptz;
CREATE INDEX IF NOT EXISTS predictions_final_idx ON agent_predictions (fixture_id, agent_id, created_at DESC, round DESC);
CREATE INDEX IF NOT EXISTS predictions_unsettled_idx ON agent_predictions (fixture_id) WHERE decision='BET_CANDIDATE' AND outcome IS NULL;
CREATE INDEX IF NOT EXISTS selections_pending_idx ON ticket_selections (fixture_id) WHERE outcome='PENDING';
UPDATE agents SET name='Ștucan' WHERE id='hantu';
INSERT INTO agents (id,name,title,risk_preference,voting,accent)
VALUES ('corina','Corina Caragea','Redacția sportivă · știri și context',0,false,'#ec4899')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,title=EXCLUDED.title,voting=false;
