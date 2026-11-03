ALTER TABLE provider_health
 ADD COLUMN transport_status text NOT NULL DEFAULT 'UNKNOWN' CHECK(transport_status IN ('REACHABLE','UNREACHABLE','UNKNOWN','NOT_CONFIGURED')),
 ADD COLUMN response_quality text NOT NULL DEFAULT 'UNKNOWN' CHECK(response_quality IN ('VALID','INVALID','ERROR','UNKNOWN','NOT_CHECKED')),
 ADD COLUMN subscription_state text NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK(subscription_state IN ('NOT_APPLICABLE','PENDING','PARTIAL','ACKNOWLEDGED','ERROR','STALE')),
 ADD COLUMN last_data_at timestamptz;
CREATE TABLE worker_heartbeats (
 run_id uuid PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL CHECK(state IN ('RUNNING','STOPPED')),
 progress jsonb NOT NULL
);
CREATE INDEX worker_heartbeat_latest ON worker_heartbeats(observed_at DESC);
