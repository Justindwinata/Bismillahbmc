CREATE TABLE paper_automations (
 session_id uuid PRIMARY KEY REFERENCES research_sessions(id), scope text NOT NULL CHECK(scope IN ('LIVE_PROVIDER','REPLAY_TEST')),
 enabled boolean NOT NULL DEFAULT true, interval_ms integer NOT NULL CHECK(interval_ms BETWEEN 1000 AND 300000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE paper_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES paper_automations(session_id), mint text NOT NULL,
 next_at timestamptz NOT NULL DEFAULT clock_timestamp(), state text NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','LEASED')),
 lease_token uuid, lease_until timestamptz, attempt integer NOT NULL DEFAULT 0, reservation_lamports numeric(20,0) NOT NULL DEFAULT 0 CHECK(reservation_lamports>=0),
 last_reason text, last_decision_id uuid REFERENCES agent_runs(decision_id), UNIQUE(session_id,mint)
);
CREATE UNIQUE INDEX one_paper_lease_per_session ON paper_jobs(session_id) WHERE state='LEASED';
CREATE INDEX paper_due_idx ON paper_jobs(next_at) WHERE state='READY';
CREATE TABLE paper_observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, job_id uuid NOT NULL REFERENCES paper_jobs(id), lease_token uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('MARKET','SECURITY','QUOTE_BUY','QUOTE_SELL','ERROR')), scope text NOT NULL CHECK(scope IN ('LIVE_PROVIDER','REPLAY_TEST')),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), payload jsonb NOT NULL, source_hash char(64) NOT NULL
);
CREATE TRIGGER immutable_paper_observations BEFORE UPDATE OR DELETE ON paper_observations FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE TABLE paper_marks (
 session_id uuid NOT NULL REFERENCES research_sessions(id), mint text NOT NULL, quantity numeric(20,0) NOT NULL,
 net_value numeric(20,0) NOT NULL CHECK(net_value>=0), received_at timestamptz NOT NULL, quote_hash char(64) NOT NULL,
 PRIMARY KEY(session_id,mint)
);
