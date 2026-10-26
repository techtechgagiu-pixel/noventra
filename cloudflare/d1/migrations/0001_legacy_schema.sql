CREATE TABLE "agent_model_assignments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "fallback_provider" TEXT,
  "fallback_model_id" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1 CHECK ("active" IN (0,1)),
  "reason" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "agent_model_assignments_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id),
  CONSTRAINT "agent_model_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX agent_model_active_uq ON agent_model_assignments (agent_id) WHERE active;

CREATE TABLE "agent_predictions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "job_id" TEXT NOT NULL,
  "fixture_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "market_key" TEXT,
  "estimated_probability" NUMERIC,
  "confidence" INTEGER,
  "risk" TEXT,
  "payload" TEXT NOT NULL CHECK ("payload" IS NULL OR json_valid("payload")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "odds" NUMERIC,
  "outcome" TEXT,
  "settled_at" TEXT,
  CONSTRAINT "agent_predictions_decision_check" CHECK ((decision IN ('BET_CANDIDATE', 'NO_BET'))),
  CONSTRAINT "agent_predictions_job_id_fixture_id_agent_id_round_key" UNIQUE (job_id, fixture_id, agent_id, round),
  CONSTRAINT "agent_predictions_job_id_fkey" FOREIGN KEY (job_id) REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  CONSTRAINT "agent_predictions_outcome_check" CHECK ((outcome IN ('WON', 'LOST', 'VOID')))
);

CREATE INDEX agent_predictions_agent_settled ON agent_predictions (agent_id, settled_at DESC) WHERE (outcome IS NOT NULL);

CREATE INDEX agent_predictions_unsettled ON agent_predictions (fixture_id) WHERE ((decision = 'BET_CANDIDATE') AND (outcome IS NULL));

CREATE INDEX predictions_final_idx ON agent_predictions (fixture_id, agent_id, created_at DESC, round DESC);

CREATE INDEX predictions_unsettled_idx ON agent_predictions (fixture_id) WHERE ((decision = 'BET_CANDIDATE') AND (outcome IS NULL));

CREATE TABLE "agent_prompt_versions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "agent_prompt_versions_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id),
  CONSTRAINT "agent_prompt_versions_agent_id_version_key" UNIQUE (agent_id, version)
);

CREATE TABLE "agents" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "risk_preference" INTEGER NOT NULL,
  "voting" INTEGER NOT NULL DEFAULT 1 CHECK ("voting" IN (0,1)),
  "accent" TEXT NOT NULL,
  CONSTRAINT "agents_pkey" PRIMARY KEY (id)
);

CREATE TABLE "analysis_events" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "job_id" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "fixture_id" TEXT,
  "agent_id" TEXT,
  "payload" TEXT NOT NULL DEFAULT '{}' CHECK ("payload" IS NULL OR json_valid("payload")),
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "analysis_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  CONSTRAINT "analysis_events_job_id_seq_key" UNIQUE (job_id, seq)
);

CREATE TABLE "audit_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "user_id" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '{}' CHECK ("detail" IS NULL OR json_valid("detail")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE "automation_runs" (
  "name" TEXT NOT NULL,
  "started_at" TEXT,
  "finished_at" TEXT,
  "last_success_at" TEXT,
  "last_error" TEXT,
  "detail" TEXT NOT NULL DEFAULT '{}' CHECK ("detail" IS NULL OR json_valid("detail")),
  "lease_owner" TEXT,
  "lease_until" TEXT,
  CONSTRAINT "automation_runs_pkey" PRIMARY KEY (name)
);

CREATE TABLE "final_decisions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "job_id" TEXT NOT NULL,
  "fixture_id" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "market_key" TEXT,
  "votes_for" INTEGER NOT NULL DEFAULT 0,
  "votes" TEXT NOT NULL CHECK ("votes" IS NULL OR json_valid("votes")),
  "validation" TEXT NOT NULL CHECK ("validation" IS NULL OR json_valid("validation")),
  "reason" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "final_decisions_job_id_fixture_id_key" UNIQUE (job_id, fixture_id),
  CONSTRAINT "final_decisions_job_id_fkey" FOREIGN KEY (job_id) REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  CONSTRAINT "final_decisions_outcome_check" CHECK ((outcome IN ('QUALIFIED', 'NO_CONSENSUS', 'NO_BET', 'REJECTED')))
);

CREATE TABLE "fixture_snapshots" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "fixture_id" TEXT NOT NULL,
  "job_id" TEXT,
  "payload" TEXT NOT NULL CHECK ("payload" IS NULL OR json_valid("payload")),
  "data_quality" TEXT NOT NULL CHECK ("data_quality" IS NULL OR json_valid("data_quality")),
  "observed_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "fixture_snapshots_fixture_id_fkey" FOREIGN KEY (fixture_id) REFERENCES fixtures(id)
);

CREATE INDEX fixture_snapshots_fixture_idx ON fixture_snapshots (fixture_id);

CREATE TABLE "fixtures" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "league_id" TEXT NOT NULL,
  "home_team" TEXT NOT NULL,
  "away_team" TEXT NOT NULL,
  "home_team_id" TEXT,
  "away_team_id" TEXT,
  "home_logo" TEXT,
  "away_logo" TEXT,
  "kickoff_utc" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "home_score" INTEGER,
  "away_score" INTEGER,
  "content_hash" TEXT NOT NULL,
  "first_seen_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ht_home" INTEGER,
  "ht_away" INTEGER,
  "corners_home" INTEGER,
  "corners_away" INTEGER,
  "facts_checked_at" TEXT,
  "results_checked_at" TEXT,
  "source_observed_at" TEXT,
  CONSTRAINT "fixtures_league_id_fkey" FOREIGN KEY (league_id) REFERENCES leagues(id),
  CONSTRAINT "fixtures_pkey" PRIMARY KEY (id)
);

CREATE INDEX fixtures_kickoff_idx ON fixtures (kickoff_utc);

CREATE INDEX fixtures_status_idx ON fixtures (status);

CREATE TABLE "historical_match_statistics" (
  "event_key" TEXT NOT NULL,
  "league_key" TEXT NOT NULL,
  "played_at" TEXT NOT NULL,
  "payload" TEXT NOT NULL CHECK ("payload" IS NULL OR json_valid("payload")),
  "fetched_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "historical_match_statistics_pkey" PRIMARY KEY (event_key)
);

CREATE TABLE "invitation_codes" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(random()&3),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "code_hash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "expires_at" TEXT NOT NULL,
  "revoked_at" TEXT,
  "last_used_at" TEXT,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "invitation_codes_code_hash_key" UNIQUE (code_hash),
  CONSTRAINT "invitation_codes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT "invitation_codes_pkey" PRIMARY KEY (id),
  CONSTRAINT "invitation_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE "leagues" (
  "id" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_key" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "top10" INTEGER NOT NULL DEFAULT 1 CHECK ("top10" IN (0,1)),
  "enabled" INTEGER NOT NULL DEFAULT 1 CHECK ("enabled" IN (0,1)),
  CONSTRAINT "leagues_pkey" PRIMARY KEY (id),
  CONSTRAINT "leagues_provider_provider_key_key" UNIQUE (provider, provider_key)
);

CREATE TABLE "model_health" (
  "model_key" TEXT NOT NULL,
  "exhausted_until" TEXT NOT NULL,
  "reason" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "model_health_pkey" PRIMARY KEY (model_key)
);

CREATE TABLE "model_usage_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "job_id" TEXT,
  "agent_id" TEXT,
  "stage" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "requested_model_id" TEXT NOT NULL,
  "ok" INTEGER NOT NULL CHECK ("ok" IN (0,1)),
  "schema_valid" INTEGER CHECK ("schema_valid" IN (0,1)),
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "latency_ms" INTEGER,
  "error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX model_usage_day_idx ON model_usage_logs (created_at);

CREATE INDEX model_usage_job_idx ON model_usage_logs (job_id);

CREATE TABLE "odds_snapshots" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "fixture_id" TEXT NOT NULL,
  "bookmaker" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "markets" TEXT NOT NULL CHECK ("markets" IS NULL OR json_valid("markets")),
  "observed_at" TEXT NOT NULL,
  "provider_updated_at" TEXT,
  "content_hash" TEXT NOT NULL,
  CONSTRAINT "odds_snapshots_fixture_id_fkey" FOREIGN KEY (fixture_id) REFERENCES fixtures(id)
);

CREATE INDEX odds_fixture_idx ON odds_snapshots (fixture_id, observed_at DESC);

CREATE TABLE "provider_usage" (
  "provider" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "provider_usage_pkey" PRIMARY KEY (provider, day)
);

CREATE TABLE "rate_limits" (
  "key" TEXT NOT NULL,
  "window_start" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY (key)
);

CREATE TABLE "schema_migrations" (
  "name" TEXT NOT NULL,
  "applied_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (name)
);

CREATE TABLE "scout_dossiers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "job_id" TEXT NOT NULL,
  "fixture_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "dossier" TEXT NOT NULL CHECK ("dossier" IS NULL OR json_valid("dossier")),
  "narrative" TEXT CHECK ("narrative" IS NULL OR json_valid("narrative")),
  "model" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "scout_dossiers_job_id_fixture_id_key" UNIQUE (job_id, fixture_id),
  CONSTRAINT "scout_dossiers_job_id_fkey" FOREIGN KEY (job_id) REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE
);

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "expires_at" TEXT NOT NULL,
  "user_agent" TEXT,
  "invitation_id" TEXT,
  "owner_code_hash" TEXT,
  "google_login" INTEGER NOT NULL DEFAULT 0 CHECK ("google_login" IN (0,1)),
  CONSTRAINT "sessions_invitation_id_fkey" FOREIGN KEY (invitation_id) REFERENCES invitation_codes(id) ON DELETE CASCADE,
  CONSTRAINT "sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE INDEX sessions_invitation_idx ON sessions (invitation_id);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE "sports_catalog_cache" (
  "provider" TEXT NOT NULL,
  "payload" TEXT NOT NULL DEFAULT '{}' CHECK ("payload" IS NULL OR json_valid("payload")),
  "next_attempt_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_error" TEXT,
  CONSTRAINT "sports_catalog_cache_pkey" PRIMARY KEY (provider)
);

CREATE TABLE "ticket_generation_jobs" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(random()&3),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "slot" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "target_odds" NUMERIC NOT NULL,
  "required_legs" INTEGER,
  "seed" TEXT NOT NULL,
  "config" TEXT NOT NULL CHECK ("config" IS NULL OR json_valid("config")),
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "checkpoint" TEXT NOT NULL DEFAULT '{}' CHECK ("checkpoint" IS NULL OR json_valid("checkpoint")),
  "candidate_order" TEXT CHECK ("candidate_order" IS NULL OR json_valid("candidate_order")),
  "eligible_count" INTEGER,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "lease_owner" TEXT,
  "lease_expires_at" TEXT,
  "next_run_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_error" TEXT,
  "last_event_seq" INTEGER NOT NULL DEFAULT 0,
  "result" TEXT CHECK ("result" IS NULL OR json_valid("result")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "started_at" TEXT,
  "finished_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "ticket_generation_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "ticket_generation_jobs_slot_check" CHECK (((slot IN ('FIVE_A', 'FIVE_B', 'TWO_A', 'TWO_B', 'WEEKLY_100', 'TEN_A', 'TEN_B')) OR (((substr(slot,1,7)='CUSTOM_' OR substr(slot,1,7)='REVIEW_') AND length(substr(slot,8)) BETWEEN 1 AND 3 AND substr(slot,8) NOT GLOB '*[^0-9]*')))),
  CONSTRAINT "ticket_generation_jobs_status_check" CHECK ((status IN ('QUEUED', 'RUNNING', 'WAITING', 'PAUSED', 'COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED'))),
  CONSTRAINT "ticket_generation_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT "ticket_generation_jobs_user_id_slot_period_key_key" UNIQUE (user_id, slot, period_key)
);

CREATE INDEX jobs_runnable_idx ON ticket_generation_jobs (status, next_run_at);

CREATE INDEX jobs_user_idx ON ticket_generation_jobs (user_id, created_at DESC);

CREATE TABLE "ticket_selections" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "fixture_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "market_key" TEXT NOT NULL,
  "market_label" TEXT NOT NULL,
  "odds" NUMERIC NOT NULL,
  "bookmaker" TEXT NOT NULL,
  "quote_observed_at" TEXT NOT NULL,
  "votes_for" INTEGER NOT NULL,
  "model_probability" NUMERIC,
  "risk" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL CHECK ("snapshot" IS NULL OR json_valid("snapshot")),
  "outcome" TEXT NOT NULL DEFAULT 'PENDING',
  "settled_at" TEXT,
  CONSTRAINT "ticket_selections_fixture_id_fkey" FOREIGN KEY (fixture_id) REFERENCES fixtures(id),
  CONSTRAINT "ticket_selections_outcome_check" CHECK ((outcome IN ('PENDING', 'WON', 'LOST', 'VOID'))),
  CONSTRAINT "ticket_selections_ticket_id_fixture_id_key" UNIQUE (ticket_id, fixture_id),
  CONSTRAINT "ticket_selections_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX selections_pending_idx ON ticket_selections (fixture_id) WHERE (outcome = 'PENDING');

CREATE TABLE "tickets" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(random()&3),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "job_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "slot" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "target_odds" NUMERIC NOT NULL,
  "actual_odds" NUMERIC,
  "leg_count" INTEGER NOT NULL DEFAULT 0,
  "generation_status" TEXT NOT NULL,
  "outcome_status" TEXT NOT NULL DEFAULT 'PENDING',
  "mixed_bookmakers" INTEGER NOT NULL DEFAULT 0 CHECK ("mixed_bookmakers" IN (0,1)),
  "summary" TEXT NOT NULL CHECK ("summary" IS NULL OR json_valid("summary")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "settled_at" TEXT,
  CONSTRAINT "tickets_generation_status_check" CHECK ((generation_status IN ('COMPLETED', 'INCOMPLETE', 'NO_BET'))),
  CONSTRAINT "tickets_job_id_fkey" FOREIGN KEY (job_id) REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  CONSTRAINT "tickets_job_id_key" UNIQUE (job_id),
  CONSTRAINT "tickets_outcome_status_check" CHECK ((outcome_status IN ('PENDING', 'WON', 'LOST', 'VOID', 'PARTIAL_VOID', 'NOT_APPLICABLE'))),
  CONSTRAINT "tickets_pkey" PRIMARY KEY (id),
  CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX tickets_created_idx ON tickets (created_at DESC);

CREATE INDEX tickets_user_idx ON tickets (user_id, created_at DESC);

CREATE TABLE "users" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(random()&3),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "google_sub" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "picture" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "sound_enabled" INTEGER NOT NULL DEFAULT 0 CHECK ("sound_enabled" IN (0,1)),
  "sound_volume" INTEGER NOT NULL DEFAULT 40,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_login_at" TEXT,
  "blocked_at" TEXT,
  CONSTRAINT "users_google_sub_key" UNIQUE (google_sub),
  CONSTRAINT "users_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_role_check" CHECK ((role IN ('user', 'admin')))
);
