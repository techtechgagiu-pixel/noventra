-- COTĂ 2 slots replace COTĂ 10 (old TEN rows stay readable as history).
ALTER TABLE ticket_generation_jobs DROP CONSTRAINT IF EXISTS ticket_generation_jobs_slot_check;
ALTER TABLE ticket_generation_jobs ADD CONSTRAINT ticket_generation_jobs_slot_check
  CHECK (slot IN ('FIVE_A','FIVE_B','TWO_A','TWO_B','WEEKLY_100','TEN_A','TEN_B'));

-- Agent track record: every agent pick is settled after the match, independently of tickets.
ALTER TABLE agent_predictions ADD COLUMN IF NOT EXISTS odds numeric(8,3);
ALTER TABLE agent_predictions ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('WON','LOST','VOID'));
ALTER TABLE agent_predictions ADD COLUMN IF NOT EXISTS settled_at timestamptz;
UPDATE agent_predictions SET odds = (payload->>'availableOdds')::numeric WHERE odds IS NULL AND payload ? 'availableOdds' AND jsonb_typeof(payload->'availableOdds') = 'number';
CREATE INDEX IF NOT EXISTS agent_predictions_unsettled ON agent_predictions (fixture_id) WHERE decision = 'BET_CANDIDATE' AND outcome IS NULL;
CREATE INDEX IF NOT EXISTS agent_predictions_agent_settled ON agent_predictions (agent_id, settled_at DESC) WHERE outcome IS NOT NULL;
