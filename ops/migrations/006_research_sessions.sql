CREATE TABLE research_sessions (
  id uuid PRIMARY KEY, mode text NOT NULL CHECK(mode IN ('PAPER','SHADOW')), policy jsonb NOT NULL, policy_hash char(64) NOT NULL,
  initial_cash numeric(20,0) NOT NULL CHECK(initial_cash>=0), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE research_journal (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id uuid NOT NULL REFERENCES research_sessions(id),
  request_key uuid NOT NULL, input_hash char(64) NOT NULL, decision_id uuid NOT NULL REFERENCES agent_runs(decision_id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), input jsonb NOT NULL, fill jsonb, snapshot jsonb NOT NULL,
  UNIQUE(session_id,request_key)
);
CREATE TRIGGER immutable_research_journal BEFORE UPDATE OR DELETE ON research_journal FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER immutable_research_sessions BEFORE UPDATE OR DELETE ON research_sessions FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
