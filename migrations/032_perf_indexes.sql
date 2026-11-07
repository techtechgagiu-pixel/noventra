-- 07.11 performance („se blochează când e mai multă lume”). D1 runs one query at a time, so a single slow read blocks everyone.
-- Ticket page and analyses read the match snapshots of one analysis: without this index the whole 110 MB table was scanned.
CREATE INDEX IF NOT EXISTS fixture_snapshots_job_idx ON fixture_snapshots (job_id, fixture_id, id);
-- Agents' final picks (Statistics, ticket page, calibration): covering index, so the ranking no longer reads every
-- prediction's JSON payload (created_at sits after the payload in the row). Led by fixture_id so the per-ticket and
-- per-month queries (filtered by match) use it too.
CREATE INDEX IF NOT EXISTS agent_predictions_final_cover ON agent_predictions (fixture_id, agent_id, job_id, round, created_at);
-- Home page debates: „did this analysis have an objection?” was checked by reading every event of the analysis.
CREATE INDEX IF NOT EXISTS analysis_events_job_type_idx ON analysis_events (job_id, type);
-- Credits page: one account's ledger.
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, created_at);
