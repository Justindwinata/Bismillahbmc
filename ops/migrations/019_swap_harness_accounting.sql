-- Additive HARNESS-only swap accounting, never mainnet authority.
ALTER TABLE execution_accounts ADD COLUMN purpose text NOT NULL DEFAULT 'TRANSFER' CHECK(purpose IN ('TRANSFER','SWAP'));
CREATE TABLE execution_swap_fills(order_id uuid PRIMARY KEY REFERENCES execution_orders(id),account_id uuid NOT NULL REFERENCES execution_accounts(id),fill jsonb,fee numeric(20,0) NOT NULL DEFAULT 0 CHECK(fee>=0),snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_swap_fills BEFORE UPDATE OR DELETE ON execution_swap_fills FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE INDEX execution_swap_account ON execution_swap_fills(account_id,created_at,order_id);
CREATE TABLE execution_swap_proposals(order_id uuid PRIMARY KEY,correlation_id uuid NOT NULL REFERENCES agent_runs(decision_id),intent_hash text NOT NULL,quote_hash text NOT NULL,policy_hash text NOT NULL,source_class text NOT NULL CHECK(source_class='REPLAY_TEST'),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_swap_proposals BEFORE UPDATE OR DELETE ON execution_swap_proposals FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
