CREATE TABLE wallet_watchlists (
  address text PRIMARY KEY, last_signature text, status text NOT NULL DEFAULT 'INITIALIZING',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE wallet_observations (
  signature text NOT NULL, wallet text NOT NULL REFERENCES wallet_watchlists(address),
  slot numeric(20,0) NOT NULL, source_at timestamptz, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  payload jsonb NOT NULL, source_hash char(64) NOT NULL, PRIMARY KEY(wallet,signature)
);
CREATE TRIGGER immutable_wallet_observations BEFORE UPDATE OR DELETE ON wallet_observations FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
