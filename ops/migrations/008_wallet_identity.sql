CREATE TABLE wallet_challenges (
 id uuid PRIMARY KEY, session_hash char(64) NOT NULL REFERENCES browser_sessions(token_hash) ON DELETE CASCADE,
 address text NOT NULL, message text NOT NULL, issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE INDEX wallet_challenge_rate_idx ON wallet_challenges(session_hash,issued_at DESC);
CREATE TABLE wallet_bindings (
 session_hash char(64) PRIMARY KEY REFERENCES browser_sessions(token_hash) ON DELETE CASCADE,
 address text NOT NULL, verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), proof_hash char(64) NOT NULL
);
