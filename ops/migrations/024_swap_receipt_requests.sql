CREATE TABLE execution_swap_receipt_requests (
 id uuid PRIMARY KEY, preflight_id uuid NOT NULL REFERENCES execution_swap_prepared(preflight_id),
 signature text NOT NULL, state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','COMPLETE')),
 attempts integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid, lease_until timestamptz, observation_id uuid REFERENCES execution_swap_receipt_observations(id),
 UNIQUE(preflight_id,signature)
);
