CREATE TABLE signer_mandate_revocations(mandate_id uuid PRIMARY KEY REFERENCES signer_mandates(id),reason text NOT NULL,revoked_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_signer_revocation BEFORE UPDATE OR DELETE ON signer_mandate_revocations FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE FUNCTION signer_commit_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='SIGNED' AND OLD.state<>'SIGNED' THEN
  IF OLD.lease_until IS NULL OR OLD.lease_until<=clock_timestamp() OR OLD.guard_certificate IS NULL OR (OLD.guard_certificate#>>'{payload,expiresAt}')::numeric<=extract(epoch FROM clock_timestamp())*1000 OR (SELECT (payload->>'expiresAt')::numeric FROM signer_mandates WHERE id=NEW.mandate_id)<=extract(epoch FROM clock_timestamp())*1000 THEN RAISE EXCEPTION 'SIGNER_COMMIT_EXPIRED'; END IF;
  IF (SELECT mode FROM system_state WHERE singleton)<>'OBSERVE' THEN RAISE EXCEPTION 'SIGNER_COMMIT_HALTED'; END IF;
  IF EXISTS(SELECT 1 FROM signer_mandate_revocations WHERE mandate_id=NEW.mandate_id) THEN RAISE EXCEPTION 'SIGNER_COMMIT_REVOKED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER signer_commit_fence AFTER UPDATE ON signer_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION signer_commit_fence();
