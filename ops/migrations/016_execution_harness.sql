-- Non-financial execution qualification namespace. No MAINNET creation/signing authority.
CREATE TABLE execution_accounts(id uuid PRIMARY KEY, mode text NOT NULL CHECK(mode='HARNESS'), initial_cash numeric(20,0) NOT NULL CHECK(initial_cash>0 AND initial_cash<=1000000),cash numeric(20,0) NOT NULL CHECK(cash>=0),reserved numeric(20,0) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=cash));
CREATE TABLE execution_orders(
 id uuid PRIMARY KEY,request_key uuid NOT NULL UNIQUE,account_id uuid NOT NULL REFERENCES execution_accounts(id),correlation_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode='HARNESS'),intent_hash text NOT NULL,intent jsonb NOT NULL,unsigned_wire text NOT NULL,verification_context jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('CREATED','VERIFIED','SIGNED','BROADCASTING','UNCERTAIN','RECONCILED','REJECTED')),
 reservation numeric(20,0) NOT NULL CHECK(reservation>0),signature text UNIQUE,signed_wire text,attempt_id uuid UNIQUE,
 lease_token uuid,lease_until timestamptz,reason text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE execution_events(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id uuid NOT NULL REFERENCES execution_orders(id),correlation_id uuid NOT NULL,state text NOT NULL,reason text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE execution_receipts(order_id uuid PRIMARY KEY REFERENCES execution_orders(id),signature text NOT NULL UNIQUE,source_class text NOT NULL CHECK(source_class='HARNESS_NOT_CHAIN'),receipt_hash text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE execution_ledger(order_id uuid PRIMARY KEY REFERENCES execution_orders(id),account_id uuid NOT NULL REFERENCES execution_accounts(id),source_class text NOT NULL CHECK(source_class='HARNESS_NOT_CHAIN'),spent numeric(20,0) NOT NULL,fee numeric(20,0) NOT NULL,cash_after numeric(20,0) NOT NULL,receipt_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_execution_events BEFORE UPDATE OR DELETE ON execution_events FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER immutable_execution_receipts BEFORE UPDATE OR DELETE ON execution_receipts FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE TRIGGER immutable_execution_ledger BEFORE UPDATE OR DELETE ON execution_ledger FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE INDEX execution_claim ON execution_orders(state,lease_until,created_at);
CREATE FUNCTION execution_commit_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state IN ('VERIFIED','SIGNED','BROADCASTING') AND OLD.state IS DISTINCT FROM NEW.state THEN
  IF NEW.lease_until IS NULL OR NEW.lease_until<=clock_timestamp() OR (NEW.intent->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'EXECUTION_COMMIT_EXPIRED'; END IF;
  IF (SELECT mode FROM system_state WHERE singleton)<>'OBSERVE' THEN RAISE EXCEPTION 'EXECUTION_COMMIT_HALTED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER execution_commit_fence AFTER UPDATE ON execution_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION execution_commit_fence();
CREATE TABLE execution_harness_balances(address text PRIMARY KEY,balance numeric(20,0) NOT NULL CHECK(balance>=0));
CREATE TABLE execution_harness_submissions(signature text PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES execution_orders(id),source_class text NOT NULL CHECK(source_class='HARNESS_NOT_CHAIN'),receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_harness_submissions BEFORE UPDATE OR DELETE ON execution_harness_submissions FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
