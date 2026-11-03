CREATE TABLE browser_sessions (
  token_hash char(64) PRIMARY KEY,
  csrf_token char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sessions_expiry_idx ON browser_sessions(expires_at);
CREATE TABLE market_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mint text NOT NULL, pair_address text NOT NULL,
  received_at timestamptz NOT NULL, source_at timestamptz,
  source_hash char(64) NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX market_mint_time_idx ON market_observations(mint,received_at DESC);
CREATE TRIGGER immutable_market BEFORE UPDATE OR DELETE ON market_observations FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
