-- Read-only observations are not execution authority, orders, or portfolio fills.
CREATE TABLE execution_swap_prepared (
 preflight_id uuid PRIMARY KEY REFERENCES execution_swap_preflights(id),
 intent jsonb NOT NULL, unsigned_wire text NOT NULL,
 verified_at bigint NOT NULL CHECK(verified_at>=0), verification_context jsonb NOT NULL
);
CREATE TRIGGER immutable_swap_prepared BEFORE UPDATE OR DELETE ON execution_swap_prepared FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE TABLE execution_swap_receipt_observations (
 id uuid PRIMARY KEY, preflight_id uuid NOT NULL REFERENCES execution_swap_prepared(preflight_id),
 signature text NOT NULL, result_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(preflight_id,signature,result_hash)
);
CREATE TRIGGER immutable_swap_receipt_observation BEFORE UPDATE OR DELETE ON execution_swap_receipt_observations FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
