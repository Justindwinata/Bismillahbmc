CREATE TABLE IF NOT EXISTS system_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL DEFAULT 'OBSERVE' CHECK (mode IN ('OBSERVE','HALTED')),
  signer_enabled boolean NOT NULL DEFAULT false CHECK (NOT signer_enabled),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO system_state(singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE source_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('dexscreener','solana-rpc')),
  source_key text NOT NULL, source_hash char(64) NOT NULL,
  data_class text NOT NULL CHECK (data_class IN ('LIVE_PROVIDER','LIVE_CHAIN')),
  received_at timestamptz NOT NULL, source_at timestamptz, slot numeric(20,0),
  payload jsonb NOT NULL,
  UNIQUE(provider, source_key, source_hash)
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL, event_type text NOT NULL, correlation_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), payload jsonb NOT NULL
);
CREATE TABLE outbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  audit_id bigint NOT NULL UNIQUE REFERENCES audit_events(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE provider_health (
  provider text PRIMARY KEY,
  status text NOT NULL CHECK(status IN ('OK','DEGRADED','NOT_CONFIGURED')),
  observed_at timestamptz NOT NULL, last_success_at timestamptz, reason text
);
CREATE INDEX source_received_idx ON source_snapshots(received_at DESC);
CREATE FUNCTION deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY'; END; $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER immutable_source BEFORE UPDATE OR DELETE ON source_snapshots FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
-- This schema intentionally has no trading intent or signer credential table yet.
-- Production roles and TRUNCATE protections require M3 hardening; migration owner is not a runtime role.
