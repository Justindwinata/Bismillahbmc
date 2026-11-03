CREATE FUNCTION execution_identity_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.request_key,NEW.account_id,NEW.correlation_id,NEW.mode,NEW.intent_hash,NEW.intent,NEW.unsigned_wire,NEW.verification_context,NEW.reservation)
 IS DISTINCT FROM ROW(OLD.id,OLD.request_key,OLD.account_id,OLD.correlation_id,OLD.mode,OLD.intent_hash,OLD.intent,OLD.unsigned_wire,OLD.verification_context,OLD.reservation) THEN RAISE EXCEPTION 'IMMUTABLE_EXECUTION_INTENT'; END IF;
 IF (OLD.signature IS NOT NULL AND NEW.signature IS DISTINCT FROM OLD.signature) OR (OLD.signed_wire IS NOT NULL AND NEW.signed_wire IS DISTINCT FROM OLD.signed_wire) OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id) THEN RAISE EXCEPTION 'IMMUTABLE_EXECUTION_ATTEMPT'; END IF;
 IF NEW.state<>OLD.state AND NOT (
  (OLD.state='CREATED' AND NEW.state IN ('VERIFIED','REJECTED')) OR
  (OLD.state='VERIFIED' AND NEW.state IN ('SIGNED','REJECTED')) OR
  (OLD.state='SIGNED' AND NEW.state IN ('BROADCASTING','REJECTED')) OR
  (OLD.state IN ('BROADCASTING','UNCERTAIN') AND NEW.state IN ('UNCERTAIN','RECONCILED'))
 ) THEN RAISE EXCEPTION 'EXECUTION_STATE_BYPASS'; END IF;
 IF NEW.state IN ('SIGNED','BROADCASTING','UNCERTAIN','RECONCILED') AND (NEW.signature IS NULL OR NEW.signed_wire IS NULL) THEN RAISE EXCEPTION 'EXECUTION_SIGNATURE_REQUIRED'; END IF;
 IF NEW.state IN ('BROADCASTING','UNCERTAIN','RECONCILED') AND NEW.attempt_id IS NULL THEN RAISE EXCEPTION 'EXECUTION_ATTEMPT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER execution_identity_fence BEFORE UPDATE ON execution_orders FOR EACH ROW EXECUTE FUNCTION execution_identity_fence();
