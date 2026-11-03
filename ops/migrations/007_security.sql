CREATE TABLE token_security_snapshots (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,mint text NOT NULL,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 slot numeric(20,0),source_hash char(64) NOT NULL,payload jsonb NOT NULL
);
CREATE INDEX security_mint_time_idx ON token_security_snapshots(mint,received_at DESC,id DESC);
CREATE TRIGGER immutable_token_security BEFORE UPDATE OR DELETE ON token_security_snapshots FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
