-- Independent signer budget/identity journal. Financial activation is not implemented by this schema.
CREATE TABLE signer_mandates(id uuid PRIMARY KEY,mode text NOT NULL CHECK(mode='HARNESS'),source_class text NOT NULL CHECK(source_class='HARNESS_NOT_CHAIN'),certificate_hash text NOT NULL,payload jsonb NOT NULL CHECK(payload->>'mode'='HARNESS' AND payload->>'genesis'='HARNESS_NO_BLOCKCHAIN_SETTLEMENT' AND (payload->>'id')::uuid=id),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE signer_requests(id uuid PRIMARY KEY,mandate_id uuid NOT NULL REFERENCES signer_mandates(id),correlation_id uuid NOT NULL,request_hash text NOT NULL,intent_hash text NOT NULL,unsigned_wire text NOT NULL,mint text NOT NULL,amount numeric(20,0) NOT NULL CHECK(amount>0),fee_reservation numeric(20,0) NOT NULL CHECK(fee_reservation>=0),state text NOT NULL CHECK(state IN('SIGNING','UNKNOWN','SIGNED')),lease_token uuid,lease_until timestamptz,signature text UNIQUE,signed_wire text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK((state='SIGNED')=(signature IS NOT NULL AND signed_wire IS NOT NULL)));
CREATE TRIGGER immutable_signer_mandate BEFORE UPDATE OR DELETE ON signer_mandates FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE FUNCTION signer_identity_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_SIGNER_REQUEST'; END IF;
 IF ROW(NEW.id,NEW.mandate_id,NEW.correlation_id,NEW.request_hash,NEW.intent_hash,NEW.unsigned_wire,NEW.mint,NEW.amount,NEW.fee_reservation) IS DISTINCT FROM ROW(OLD.id,OLD.mandate_id,OLD.correlation_id,OLD.request_hash,OLD.intent_hash,OLD.unsigned_wire,OLD.mint,OLD.amount,OLD.fee_reservation) THEN RAISE EXCEPTION 'IMMUTABLE_SIGNER_REQUEST'; END IF;
 IF OLD.state='SIGNED' AND ROW(NEW.state,NEW.signature,NEW.signed_wire) IS DISTINCT FROM ROW(OLD.state,OLD.signature,OLD.signed_wire) THEN RAISE EXCEPTION 'IMMUTABLE_SIGNER_RESULT'; END IF;
 IF NEW.state IS DISTINCT FROM OLD.state AND NOT ((OLD.state='SIGNING' AND NEW.state IN('UNKNOWN','SIGNED')) OR (OLD.state='UNKNOWN' AND NEW.state='SIGNED')) THEN RAISE EXCEPTION 'SIGNER_STATE_BYPASS'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER signer_identity_fence BEFORE UPDATE OR DELETE ON signer_requests FOR EACH ROW EXECUTE FUNCTION signer_identity_fence();
CREATE INDEX signer_budget ON signer_requests(mandate_id,mint);
