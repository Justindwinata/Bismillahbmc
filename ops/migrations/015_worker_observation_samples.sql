CREATE TABLE worker_observation_samples (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id uuid NOT NULL REFERENCES worker_heartbeats(run_id),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(), state text NOT NULL CHECK(state IN ('RUNNING','STOPPED')),
 mode text NOT NULL CHECK(mode IN ('OBSERVE','HALTED')), progress jsonb NOT NULL, providers jsonb NOT NULL
);
CREATE INDEX worker_sample_time ON worker_observation_samples(observed_at);
CREATE TRIGGER immutable_worker_samples BEFORE UPDATE OR DELETE ON worker_observation_samples FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
