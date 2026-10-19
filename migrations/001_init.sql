-- BETMIND SIX · NEXUS 5.0 — initial schema
-- All timestamps are UTC (timestamptz). User-facing day/week boundaries use Europe/Bucharest
-- and are stored explicitly as period_key (YYYY-MM-DD local date or ISO-week Monday date).

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub    text NOT NULL UNIQUE,
  email         text NOT NULL,
  name          text,
  picture       text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  sound_enabled boolean NOT NULL DEFAULT false,
  sound_volume  integer NOT NULL DEFAULT 40,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  id          text PRIMARY KEY,               -- sha256 of the random session token
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

-- ── AI configuration ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id              text PRIMARY KEY,           -- victor, andrei, mihai, alex, diana, robert, scout
  name            text NOT NULL,
  title           text NOT NULL,
  risk_preference integer NOT NULL,
  voting          boolean NOT NULL DEFAULT true,
  accent          text NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_prompt_versions (
  id          bigserial PRIMARY KEY,
  agent_id    text NOT NULL REFERENCES agents(id),
  version     text NOT NULL,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

CREATE TABLE IF NOT EXISTS agent_model_assignments (
  id                bigserial PRIMARY KEY,
  agent_id          text NOT NULL REFERENCES agents(id),
  provider          text NOT NULL,
  model_id          text NOT NULL,
  fallback_provider text,
  fallback_model_id text,
  active            boolean NOT NULL DEFAULT true,
  reason            text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_model_active_uq ON agent_model_assignments(agent_id) WHERE active;

CREATE TABLE IF NOT EXISTS model_usage_logs (
  id            bigserial PRIMARY KEY,
  job_id        uuid,
  agent_id      text,
  stage         text NOT NULL,
  provider      text NOT NULL,
  model_id      text NOT NULL,
  requested_model_id text NOT NULL,
  ok            boolean NOT NULL,
  schema_valid  boolean,
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_usage_day_idx ON model_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS model_usage_job_idx ON model_usage_logs(job_id);

-- ── Football ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id            text PRIMARY KEY,             -- canonical id (e.g. ENG1)
  country       text NOT NULL,
  name          text NOT NULL,
  provider      text NOT NULL,                -- espn | lpf
  provider_key  text NOT NULL,                -- e.g. eng.1
  priority      integer NOT NULL,
  top10         boolean NOT NULL DEFAULT true,
  enabled       boolean NOT NULL DEFAULT true,
  UNIQUE (provider, provider_key)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id            text PRIMARY KEY,             -- provider:eventId
  provider      text NOT NULL,
  provider_id   text NOT NULL,
  league_id     text NOT NULL REFERENCES leagues(id),
  home_team     text NOT NULL,
  away_team     text NOT NULL,
  home_team_id  text,
  away_team_id  text,
  home_logo     text,
  away_logo     text,
  kickoff_utc   timestamptz NOT NULL,
  status        text NOT NULL,                -- pre | in | post | postponed | cancelled
  home_score    integer,
  away_score    integer,
  content_hash  text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fixtures_kickoff_idx ON fixtures(kickoff_utc);
CREATE INDEX IF NOT EXISTS fixtures_status_idx ON fixtures(status);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id            bigserial PRIMARY KEY,
  fixture_id    text NOT NULL REFERENCES fixtures(id),
  bookmaker     text NOT NULL,
  source        text NOT NULL,
  markets       jsonb NOT NULL,              -- [{key,label,odds,marketType,line}]
  observed_at   timestamptz NOT NULL,
  provider_updated_at timestamptz,
  content_hash  text NOT NULL
);
CREATE INDEX IF NOT EXISTS odds_fixture_idx ON odds_snapshots(fixture_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS fixture_snapshots (
  id          bigserial PRIMARY KEY,
  fixture_id  text NOT NULL REFERENCES fixtures(id),
  job_id      uuid,
  payload     jsonb NOT NULL,
  data_quality jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fixture_snapshots_fixture_idx ON fixture_snapshots(fixture_id);

-- Shared historical research cache (deduplicated across jobs/users).
CREATE TABLE IF NOT EXISTS historical_match_statistics (
  event_key    text PRIMARY KEY,             -- provider:eventId
  league_key   text NOT NULL,
  played_at    timestamptz NOT NULL,
  payload      jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Tickets & jobs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_generation_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot            text NOT NULL CHECK (slot IN ('FIVE_A','FIVE_B','TEN_A','TEN_B','WEEKLY_100')),
  period_key      date NOT NULL,              -- local date (daily) or ISO week Monday (weekly)
  target_odds     numeric(10,2) NOT NULL,
  required_legs   integer,                    -- 12 for weekly, null = AUTO
  seed            text NOT NULL,
  config          jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'QUEUED'
                  CHECK (status IN ('QUEUED','RUNNING','WAITING','PAUSED','COMPLETED','INCOMPLETE','NO_BET','FAILED')),
  stage           text NOT NULL DEFAULT 'QUEUED',
  checkpoint      jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_order jsonb,
  eligible_count  integer,
  attempt_count   integer NOT NULL DEFAULT 0,
  lease_owner     text,
  lease_expires_at timestamptz,
  next_run_at     timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  last_event_seq  integer NOT NULL DEFAULT 0,
  result          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot, period_key)
);
CREATE INDEX IF NOT EXISTS jobs_runnable_idx ON ticket_generation_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS jobs_user_idx ON ticket_generation_jobs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_events (
  id             bigserial PRIMARY KEY,
  job_id         uuid NOT NULL REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  seq            integer NOT NULL,
  type           text NOT NULL,
  stage          text NOT NULL,
  fixture_id     text,
  agent_id       text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, seq)
);

CREATE TABLE IF NOT EXISTS scout_dossiers (
  id          bigserial PRIMARY KEY,
  job_id      uuid NOT NULL REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  fixture_id  text NOT NULL,
  mode        text NOT NULL,                  -- statistics | video
  dossier     jsonb NOT NULL,
  narrative   jsonb,
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, fixture_id)
);

CREATE TABLE IF NOT EXISTS agent_predictions (
  id             bigserial PRIMARY KEY,
  job_id         uuid NOT NULL REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  fixture_id     text NOT NULL,
  agent_id       text NOT NULL,
  round          integer NOT NULL,           -- 0 = independent, 1..2 = debate revisions
  provider       text NOT NULL,
  model_id       text NOT NULL,
  prompt_version text NOT NULL,
  decision       text NOT NULL CHECK (decision IN ('BET_CANDIDATE','NO_BET')),
  market_key     text,
  estimated_probability numeric(6,4),
  confidence     integer,
  risk           text,
  payload        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, fixture_id, agent_id, round)
);

CREATE TABLE IF NOT EXISTS final_decisions (
  id            bigserial PRIMARY KEY,
  job_id        uuid NOT NULL REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  fixture_id    text NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('QUALIFIED','NO_CONSENSUS','NO_BET','REJECTED')),
  market_key    text,
  votes_for     integer NOT NULL DEFAULT 0,
  votes         jsonb NOT NULL,
  validation    jsonb NOT NULL,
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, fixture_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL UNIQUE REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot            text NOT NULL,
  period_key      date NOT NULL,
  target_odds     numeric(10,2) NOT NULL,
  actual_odds     numeric(12,3),
  leg_count       integer NOT NULL DEFAULT 0,
  generation_status text NOT NULL CHECK (generation_status IN ('COMPLETED','INCOMPLETE','NO_BET')),
  outcome_status  text NOT NULL DEFAULT 'PENDING' CHECK (outcome_status IN ('PENDING','WON','LOST','VOID','PARTIAL_VOID','NOT_APPLICABLE')),
  mixed_bookmakers boolean NOT NULL DEFAULT false,
  summary         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  settled_at      timestamptz
);
CREATE INDEX IF NOT EXISTS tickets_user_idx ON tickets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_selections (
  id             bigserial PRIMARY KEY,
  ticket_id      uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  fixture_id     text NOT NULL REFERENCES fixtures(id),
  position       integer NOT NULL,
  market_key     text NOT NULL,
  market_label   text NOT NULL,
  odds           numeric(8,3) NOT NULL,
  bookmaker      text NOT NULL,
  quote_observed_at timestamptz NOT NULL,
  votes_for      integer NOT NULL,
  model_probability numeric(6,4),
  risk           text NOT NULL,
  snapshot       jsonb NOT NULL,
  outcome        text NOT NULL DEFAULT 'PENDING' CHECK (outcome IN ('PENDING','WON','LOST','VOID')),
  UNIQUE (ticket_id, fixture_id)
);

-- ── Operations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_usage (
  provider   text NOT NULL,
  day        date NOT NULL,                  -- UTC day
  requests   integer NOT NULL DEFAULT 0,
  tokens     integer NOT NULL DEFAULT 0,
  errors     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, day)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key        text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count      integer NOT NULL
);
