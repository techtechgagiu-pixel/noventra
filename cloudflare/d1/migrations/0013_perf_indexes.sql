-- 28.10 performance: the settlement and statistics queries looked these up by fixture with full scans.
CREATE INDEX IF NOT EXISTS final_decisions_fixture_idx ON final_decisions (fixture_id, outcome);
CREATE INDEX IF NOT EXISTS ticket_selections_fixture_idx ON ticket_selections (fixture_id, outcome);
CREATE INDEX IF NOT EXISTS fixtures_provider_status_kickoff_idx ON fixtures (provider, status, kickoff_utc);
CREATE INDEX IF NOT EXISTS model_usage_provider_day_idx ON model_usage_logs (provider, created_at);
CREATE INDEX IF NOT EXISTS agent_predictions_fixture_decision_idx ON agent_predictions (fixture_id, decision, outcome);
