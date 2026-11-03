CREATE TABLE agent_runs (
  decision_id uuid PRIMARY KEY, mint text NOT NULL, input_hash char(64) NOT NULL, policy_hash char(64) NOT NULL,
  mode text NOT NULL CHECK(mode IN ('OBSERVE','HALTED')), action text NOT NULL CHECK(action='SKIP'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(mint,input_hash,policy_hash,mode)
);
CREATE TABLE agent_events (
  event_id uuid PRIMARY KEY, decision_id uuid NOT NULL REFERENCES agent_runs(decision_id),
  role text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),payload jsonb NOT NULL,
  UNIQUE(decision_id,role)
);
CREATE TRIGGER immutable_agent_runs BEFORE UPDATE OR DELETE ON agent_runs FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER immutable_agent_events BEFORE UPDATE OR DELETE ON agent_events FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
